declare module '@anthropic-ai/claude-code' {
  interface QueryOptions {
    systemPrompt?: string
    model?: 'sonnet' | 'opus' | 'haiku'
    allowedTools?: string[]
    disallowedTools?: string[]
    permissionMode?: 'default' | 'acceptEdits' | 'dontAsk' | 'bypassPermissions' | 'plan'
    cwd?: string
    maxTurns?: number
    maxThinkingTokens?: number
    abortController?: AbortController
    agents?: Record<string, {
      description: string
      prompt: string
      tools?: string[]
      model?: 'sonnet' | 'opus' | 'haiku'
    }>
    includePartialMessages?: boolean
    resume?: string
  }

  interface SDKMessage {
    type: string
    subtype?: string
    message?: {
      content?: Array<Record<string, unknown>>
    }
    input_tokens?: number
    output_tokens?: number
    [key: string]: unknown
  }

  function query(params: {
    prompt: string | AsyncIterable<unknown>
    options?: QueryOptions
  }): AsyncIterable<SDKMessage>

  export { query, QueryOptions, SDKMessage }
}
