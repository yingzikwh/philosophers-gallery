/**
 * OpenAI 兼容 API 的非流式补全助手（阶段 3 引入）
 *
 * index.js / debate.js 各自内联了流式 fetch；漂流瓶「拾瓶而答」只需一次性
 * 完整回答，故抽一个最小的 chatOnce(messages, config)：
 * - 未配置 Key → 抛带 status=503 的错误（路由层直接转 JSON 响应）
 * - 上游非 2xx / 空内容 → 抛带 status=502 的错误，附截断后的上游详情
 */

export async function chatOnce(messages, config = {}) {
  const { apiKey = '', baseUrl = 'https://api.openai.com/v1', model = 'gpt-4o-mini' } = config;
  if (!apiKey) {
    throw Object.assign(
      new Error('未配置模型 API Key（.env 的 OPENAI_API_KEY），无法生成回应'),
      { status: 503 },
    );
  }

  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';
  const upstream = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages, stream: false }),
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => '');
    throw Object.assign(
      new Error(`模型调用失败 HTTP ${upstream.status}${detail ? `：${detail.slice(0, 200)}` : ''}`),
      { status: 502 },
    );
  }

  const data = await upstream.json().catch(() => null);
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw Object.assign(new Error('模型返回空内容'), { status: 502 });
  }
  return text;
}
