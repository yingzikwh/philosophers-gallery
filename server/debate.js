/**
 * 圆桌辩论编排 —— 多位思想家就同一命题进行回合制交锋。
 *
 * 设计要点：
 * - 复用主服务注入的 buildSystemPrompt（人设 prompt + RAG 知识 + 不编造约束），
 *   确保每位思想家发言符合其真实思想与专属口吻。
 * - 串行编排：维护 transcript（发言记录），后发言者能读到此前所有发言，
 *   从而真正“回应/反驳”，而非各说各话。
 * - SSE 流式：逐位流式转发，用 turn_start / delta / turn_end 标记 speaker 与轮次。
 * - 客户端断开（abort）时及时中止后续编排，避免无谓的 token 消耗。
 *
 * 由 server/index.js 在 POST /api/debate 调用，依赖通过 deps 注入。
 */

const PHASES = [
  { round: 1, phase: 'opening', label: '开场陈词' },
  { round: 2, phase: 'rebuttal', label: '交叉质询' },
  { round: 3, phase: 'closing', label: '总结陈词' },
];

/** 把发言记录格式化为可注入上下文的文本 */
function formatTranscript(transcript) {
  if (!transcript.length) return '（你是本场首位发言者）';
  return transcript
    .map((t) => `【${t.name} · ${PHASES[t.round - 1]?.label || ''}】${t.content}`)
    .join('\n\n');
}

/** 按轮次为该位思想家构建 user 指令消息（含命题 + 此前发言 + 本轮任务） */
function buildTurnMessage(topic, transcript, self, participants, phaseInfo) {
  const names = participants.map((p) => p.name).join('、');
  const others = participants.filter((p) => p.id !== self.id).map((p) => p.name);
  const record = formatTranscript(transcript);

  if (phaseInfo.phase === 'opening') {
    return [
      `你正在参与一场圆桌辩论。本场辩题：「${topic}」。`,
      `同场辩手：${names}。`,
      transcript.length ? `此前的开场发言：\n${record}` : '你是本场首位发言者。',
      `请阐述你对该辩题的立场与核心论点，观点鲜明、言简意赅，控制在 160 字以内，务必符合你一贯的思想与口吻。`,
    ].join('\n\n');
  }

  if (phaseInfo.phase === 'rebuttal') {
    return [
      `圆桌辩论进入交叉质询环节。辩题：「${topic}」。`,
      `此前的开场陈词记录：\n${record}`,
      `请你针对${others.join('、') || '其他辩手'}的观点作出回应或反驳，明确指出你认同或不认同之处并说明理由，同时深化自己的立场。控制在 180 字以内，保持你的思想口吻。`,
    ].join('\n\n');
  }

  // closing
  return [
    `圆桌辩论进入总结陈词环节。辩题：「${topic}」。`,
    `完整辩论记录：\n${record}`,
    `请做最后的总结陈词，凝练你的核心立场，并回应本场辩论中最关键的交锋点。控制在 150 字以内。`,
  ].join('\n\n');
}

/**
 * 处理 POST /api/debate。
 * @returns {Promise<boolean>} 始终返回 true（表示该请求已被本处理器接管）
 */
export async function handleDebate(req, res, deps) {
  const { buildSystemPrompt, parseBody, sendJSON, corsHeaders, config } = deps;
  const { OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL } = config;

  if (!OPENAI_API_KEY || OPENAI_API_KEY.includes('在此填入')) {
    sendJSON(res, 500, { error: '未配置 OPENAI_API_KEY，请在 .env 中设置后再发起辩论' });
    return true;
  }

  let body;
  try {
    body = await parseBody(req);
  } catch {
    sendJSON(res, 400, { error: '请求体解析失败' });
    return true;
  }

  const participants = Array.isArray(body.participants)
    ? body.participants
        .filter((p) => p && p.id)
        .slice(0, 4)
        .map((p) => ({ id: String(p.id), name: String(p.name || p.id) }))
    : [];
  const topic = String(body.topic || '').trim().slice(0, 200);
  const rounds = Math.min(Math.max(parseInt(body.rounds, 10) || 2, 1), PHASES.length);
  const model = body.model || OPENAI_MODEL;

  if (participants.length < 2) {
    sendJSON(res, 400, { error: '至少需要 2 位思想家才能展开辩论' });
    return true;
  }
  if (!topic) {
    sendJSON(res, 400, { error: '缺少辩论命题' });
    return true;
  }

  res.writeHead(200, {
    ...corsHeaders,
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  let aborted = false;
  req.on('close', () => { aborted = true; });
  const send = (obj) => {
    if (aborted || res.writableEnded) return;
    try { res.write(`data: ${JSON.stringify(obj)}\n\n`); } catch { /* 客户端已断开 */ }
  };

  send({ type: 'debate_start', topic, rounds, participants });

  const transcript = [];
  const apiUrl = OPENAI_BASE_URL.replace(/\/+$/, '') + '/chat/completions';

  for (let r = 1; r <= rounds && !aborted; r++) {
    const phaseInfo = PHASES[r - 1];
    for (const p of participants) {
      if (aborted) break;
      send({ type: 'turn_start', speaker: p.id, name: p.name, round: r, phase: phaseInfo.phase, phaseLabel: phaseInfo.label });

      const messages = [
        { role: 'system', content: buildSystemPrompt(p.id, topic) },
        { role: 'user', content: buildTurnMessage(topic, transcript, p, participants, phaseInfo) },
      ];

      let full = '';
      try {
        const upstream = await fetch(apiUrl, {
          method: 'POST',
          headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model, messages, stream: true }),
        });

        if (!upstream.ok || !upstream.body) {
          const detail = await upstream.text().catch(() => '');
          send({ type: 'turn_error', speaker: p.id, message: `${p.name} 发言失败（${upstream.status}）`, detail: detail.slice(0, 200) });
          continue;
        }

        const reader = upstream.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (true) {
          if (aborted) { try { reader.cancel(); } catch { /* ignore */ } break; }
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            const t = line.trim();
            if (!t.startsWith('data:')) continue;
            const payload = t.slice(5).trim();
            if (payload === '[DONE]') continue;
            try {
              const j = JSON.parse(payload);
              const d = j.choices?.[0]?.delta?.content;
              if (d) { full += d; send({ type: 'delta', speaker: p.id, content: d }); }
            } catch { /* 忽略非法 JSON 行 */ }
          }
        }
      } catch (e) {
        if (!aborted) send({ type: 'turn_error', speaker: p.id, message: `${p.name} 发言中断：${e.message}` });
        continue;
      }

      transcript.push({ speaker: p.id, name: p.name, round: r, phase: phaseInfo.phase, content: full });
      send({ type: 'turn_end', speaker: p.id, round: r, length: full.length });
    }
  }

  if (!aborted) {
    send({ type: 'debate_end', transcript });
    res.write('data: [DONE]\n\n');
  }
  try { res.end(); } catch { /* ignore */ }
  return true;
}
