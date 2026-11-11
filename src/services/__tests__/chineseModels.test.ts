/**
 * 腾讯混元 / 百度文心一言（千帆 V2）接入回归测试
 *
 * 背景：这两个模型原先在设置里能填 Key、帮助文档也宣称支持，
 * 但 geminiService 的解析与生成两条路径都直接 throw「暂未实现」。
 * 本测试锁定两条路径都要走官方 OpenAI 兼容接口，防止回退。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { AISettings } from '../../types';
import { parseQuestionsWithAI, generateQuestionsFromPrompt } from '../geminiService';

const HUNYUAN_URL = 'https://api.hunyuan.cloud.tencent.com/v1/chat/completions';
const QIANFAN_URL = 'https://qianfan.baidubce.com/v2/chat/completions';

/** 最小合法题目 JSON，供解析路径走完整流程 */
const QUESTION_CONTENT = JSON.stringify({
  questions: [
    {
      title: '1+1=?',
      type: 'single',
      options: ['2', '3'],
      answer: 'A',
      subject: 'math',
      explanation: '基础加法',
    },
  ],
});

function mockFetchResponse(content: string) {
  return {
    ok: true,
    json: async () => ({
      choices: [
        { message: { content }, finish_reason: 'stop', native_finish_reason: null },
      ],
    }),
  };
}

/** 读取最近一次 fetch 调用的 URL / model / Authorization */
function lastRequest() {
  const calls = vi.mocked(fetch).mock.calls;
  const [url, init] = calls[calls.length - 1] as unknown as [string, RequestInit];
  const body = JSON.parse(init.body as string);
  const headers = init.headers as Record<string, string>;
  return { url, model: body.model, auth: headers.Authorization };
}

describe('腾讯混元 / 百度千帆 V2 接入', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn(async () => mockFetchResponse(QUESTION_CONTENT)));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('解析路径：混元走 /v1/chat/completions 且模型名原样传递', async () => {
    const settings = { hunyuanKey: 'sk-hunyuan-test' } as AISettings;
    const questions = await parseQuestionsWithAI('测试文本', 'hunyuan-turbos-latest', settings);

    expect(lastRequest()).toMatchObject({
      url: HUNYUAN_URL,
      model: 'hunyuan-turbos-latest',
      auth: 'Bearer sk-hunyuan-test',
    });
    expect(questions).toHaveLength(1);
  });

  it('解析路径：文心走千帆 /v2/chat/completions', async () => {
    const settings = { ernieKey: 'bce-v3/ALTAK-test/secret' } as AISettings;
    const questions = await parseQuestionsWithAI('测试文本', 'ernie-4.0-turbo-128k', settings);

    expect(lastRequest()).toMatchObject({
      url: QIANFAN_URL,
      model: 'ernie-4.0-turbo-128k',
      auth: 'Bearer bce-v3/ALTAK-test/secret',
    });
    expect(questions).toHaveLength(1);
  });

  it('生成路径：混元同样走 /v1，且返回原始文本', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockFetchResponse('生成的题目文本') as unknown as Response);
    const settings = { hunyuanKey: 'sk-hunyuan-test' } as AISettings;

    const result = await generateQuestionsFromPrompt('出 3 道加法题', 'hunyuan-turbos-latest', settings);

    expect(lastRequest().url).toBe(HUNYUAN_URL);
    expect(result).toBe('生成的题目文本');
  });

  it('生成路径：文心同样走千帆 /v2', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(mockFetchResponse('生成的题目文本') as unknown as Response);
    const settings = { ernieKey: 'bce-v3/ALTAK-test/secret' } as AISettings;

    const result = await generateQuestionsFromPrompt('出 3 道加法题', 'ernie-4.0-turbo-128k', settings);

    expect(lastRequest().url).toBe(QIANFAN_URL);
    expect(result).toBe('生成的题目文本');
  });

  it('缺少 API Key 时仍给出配置提示，而非发起请求', async () => {
    await expect(
      parseQuestionsWithAI('测试文本', 'hunyuan-turbos-latest', {} as AISettings)
    ).rejects.toThrow('请先在设置中配置腾讯混元 API Key');
    expect(fetch).not.toHaveBeenCalled();
  });
});
