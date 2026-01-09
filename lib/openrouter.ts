/**
 * OpenRouter.ai API クライアント
 */

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterResponse {
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * OpenRouter.ai APIを呼び出す
 */
export async function callOpenRouter(
  messages: OpenRouterMessage[],
  model: string = 'anthropic/claude-3.5-sonnet',
  temperature: number = 0.7,
  maxRetries: number = 2
): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY環境変数が設定されていません');
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
          'HTTP-Referer': process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
          'X-Title': '競合バナー分析アプリ',
        },
        body: JSON.stringify({
          model,
          messages,
          temperature,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenRouter API error: ${response.status} ${errorText}`);
      }

      const data: OpenRouterResponse = await response.json();

      if (!data.choices || data.choices.length === 0) {
        throw new Error('OpenRouter API returned no choices');
      }

      const content = data.choices[0].message.content;
      
      if (!content) {
        throw new Error('OpenRouter API returned empty content');
      }

      return content;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < maxRetries) {
        // 指数バックオフでリトライ
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }
      
      throw lastError;
    }
  }

  throw lastError || new Error('Unknown error');
}

/**
 * JSONレスポンスをパースする（LLMがJSONを返す場合）
 */
export async function callOpenRouterJSON<T>(
  messages: OpenRouterMessage[],
  model: string = 'anthropic/claude-3.5-sonnet',
  temperature: number = 0.3
): Promise<T> {
  const systemMessage: OpenRouterMessage = {
    role: 'system',
    content: 'あなたはJSON形式で応答するアシスタントです。常に有効なJSONのみを返してください。説明文やマークダウンは含めないでください。',
  };

  const response = await callOpenRouter(
    [systemMessage, ...messages],
    model,
    temperature
  );

  try {
    // JSONを抽出（マークダウンコードブロックがある場合）
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/) || response.match(/```\s*([\s\S]*?)\s*```/);
    const jsonString = jsonMatch ? jsonMatch[1] : response;
    
      return JSON.parse(jsonString.trim()) as T;
    } catch (error) {
      console.error('JSON parse error:', error);
      console.log('Response:', response);
      throw new Error(`Failed to parse JSON response: ${error instanceof Error ? error.message : String(error)}`);
    }
}
