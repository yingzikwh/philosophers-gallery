/**
 * 圆桌辩论编排 —— 多位思想家就同一命题进行回合制交锋。
 *
 * 设计要点：
 * - 复用主服务注入的 buildSystemPrompt（人设 prompt + RAG 知识 + 不编造约束），
 *   确保每位思想家发言符合其真实思想与专属口吻。
 * - 串行编排：维护 transcript（发言记录），后发言者能读到此前所有发言，
 *   从而真正“回应/反驳”，而非各说各话。
 * - 分轮推进：请求用 startRound/endRound 指定本次要跑的轮次区间，默认只跑 startRound 那一轮，
 *   跑完即交回控制权，由前端点「下一轮」再发一次请求并回传 transcript 延续上下文。
 *   服务端因此保持无状态，既支持逐轮暂停，也支持传 endRound=rounds 一次跑完全场。
 * - 用户上桌：名单中 id='user' 只占位，后端不代为生成，其发言由前端提交。
 * - SSE 流式：逐位流式转发，用 turn_start / delta / turn_end 标记 speaker 与轮次。
 * - 客户端断开（abort）时及时中止后续编排，避免无谓的 token 消耗。
 *
 * 由 server/index.js 在 POST /api/debate 调用，依赖通过 deps 注入。
 */

/** 最大总轮次：开场 + 四次递进交锋 + 总结 */
const MAX_ROUNDS = 6;
/** 思想家（不含用户）的上限 */
const MAX_AI_SPEAKERS = 4;
/** 用户本人的固定 id：只进名单，不生成发言 */
const USER_SPEAKER_ID = 'user';

/** 交锋环节的递进标签，超出个数则复用最后一个 */
const EXCHANGE_LABELS = ['交叉质询', '深入交锋', '层层诘难', '极限辩难'];

/**
 * 按总轮次生成阶段安排：
 * 1 轮 → 开场陈词；2 轮 → 开场 + 质询；≥3 轮 → 开场 +（轮次-2）次交锋 + 总结陈词
 */
function buildSchedule(rounds) {
  const list = [{ phase: 'opening', label: '开场陈词' }];
  if (rounds === 2) {
    list.push({ phase: 'rebuttal', label: EXCHANGE_LABELS[0] });
  } else if (rounds >= 3) {
    for (let i = 0; i < rounds - 2; i++) {
      list.push({
        phase: 'rebuttal',
        label: EXCHANGE_LABELS[Math.min(i, EXCHANGE_LABELS.length - 1)],
      });
    }
    list.push({ phase: 'closing', label: '总结陈词' });
  }
  return list.map((item, i) => ({ ...item, round: i + 1 }));
}

/** 把发言记录格式化为可注入上下文的文本 */
function formatTranscript(transcript, schedule) {
  if (!transcript.length) return '（你是本场首位发言者）';
  return transcript
    .map((t) => {
      const label = t.phaseLabel || schedule[t.round - 1]?.label || '';
      return `【${t.name} · ${label}】${t.content}`;
    })
    .join('\n\n');
}

/**
 * 按轮次为该位思想家构建 user 指令消息。
 * @param speakers 需要生成发言的思想家名单（不含用户）
 * @param human    用户参与项，为 null 表示纯 AI 辩论
 */
function buildTurnMessage(topic, transcript, self, speakers, phaseInfo, schedule, human) {
  const rosterNames = [...speakers.map((p) => p.name), ...(human ? [human.name] : [])].join('、');
  const others = speakers.filter((p) => p.id !== self.id).map((p) => p.name);
  const record = formatTranscript(transcript, schedule);
  const humanNote = human
    ? `现场还有普通参与者「${human.name}」参辩，其发言已记入下方记录，请正面回应其中的质疑或提问。`
    : '';

  if (phaseInfo.phase === 'opening') {
    return [
      `你正在参与一场圆桌辩论。本场辩题：「${topic}」。`,
      `同场辩手：${rosterNames}。`,
      humanNote,
      transcript.length ? `此前的开场发言：\n${record}` : '你是本场首位发言者。',
      `请阐述你对该辩题的立场与核心论点，观点鲜明、言简意赅，控制在 160 字以内，务必符合你一贯的思想与口吻。`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  if (phaseInfo.phase === 'rebuttal') {
    return [
      `圆桌辩论进入${phaseInfo.label}环节。辩题：「${topic}」。`,
      `此前的发言记录：\n${record}`,
      humanNote,
      `请你针对${others.join('、') || '其他辩手'}的观点作出回应或反驳，明确指出你认同或不认同之处并说明理由，同时深化自己的立场。控制在 180 字以内，保持你的思想口吻。`,
    ]
      .filter(Boolean)
      .join('\n\n');
  }

  // closing
  return [
    `圆桌辩论进入总结陈词环节。辩题：「${topic}」。`,
    `完整辩论记录：\n${record}`,
    humanNote,
    `请做最后的总结陈词，凝练你的核心立场，并回应本场辩论中最关键的交锋点。控制在 150 字以内。`,
  ]
    .filter(Boolean)
    .join('\n\n');
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
        .slice(0, MAX_AI_SPEAKERS + 1)
        .map((p) => ({ id: String(p.id), name: String(p.name || p.id) }))
    : [];
  /* 用户本人只进名单，发言由前端提交，后端不代为生成 */
  const human = participants.find((p) => p.id === USER_SPEAKER_ID) || null;
  const speakers = participants.filter((p) => p.id !== USER_SPEAKER_ID);

  const topic = String(body.topic || '').trim().slice(0, 200);
  const rounds = Math.min(Math.max(parseInt(body.rounds, 10) || 2, 1), MAX_ROUNDS);
  const schedule = buildSchedule(rounds);
  const startRound = Math.min(Math.max(parseInt(body.startRound, 10) || 1, 1), rounds);
  /* 本次请求的最后一轮：默认等于 startRound，即一次只推进一轮，避免「下一轮」跑完整场 */
  const endRound = Math.min(Math.max(parseInt(body.endRound, 10) || startRound, startRound), rounds);
  const model = body.model || OPENAI_MODEL;

  /** 分轮推进时前端回传的既往发言，用于延续上下文 */
  const priorTranscript = Array.isArray(body.transcript)
    ? body.transcript
        .filter((t) => t && typeof t.content === 'string' && t.content.trim())
        .map((t) => ({
          speaker: String(t.speaker || ''),
          name: String(t.name || t.speaker || ''),
          round: Math.min(Math.max(Number(t.round) || 1, 1), rounds),
          phase: String(t.phase || 'opening'),
          phaseLabel: String(t.phaseLabel || ''),
          content: String(t.content).slice(0, 2000),
        }))
    : [];

  if (speakers.length < 2) {
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

  send({ type: 'debate_start', topic, rounds, participants, schedule, startRound, endRound });

  const transcript = startRound > 1 ? priorTranscript : [];
  const apiUrl = OPENAI_BASE_URL.replace(/\/+$/, '') + '/chat/completions';

  for (let r = startRound; r <= endRound && !aborted; r++) {
    const phaseInfo = schedule[r - 1];
    for (const p of speakers) {
      if (aborted) break;
      send({ type: 'turn_start', speaker: p.id, name: p.name, round: r, phase: phaseInfo.phase, phaseLabel: phaseInfo.label });

      const messages = [
        { role: 'system', content: buildSystemPrompt(p.id, topic) },
        {
          role: 'user',
          content: buildTurnMessage(topic, transcript, p, speakers, phaseInfo, schedule, human),
        },
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

      transcript.push({
        speaker: p.id,
        name: p.name,
        round: r,
        phase: phaseInfo.phase,
        phaseLabel: phaseInfo.label,
        content: full,
      });
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
