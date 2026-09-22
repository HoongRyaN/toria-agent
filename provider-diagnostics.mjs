// Expose only fixed diagnostic codes and messages, never raw provider errors.
export function providerDiagnostic(error, httpStatus = null) {
  const transport = error?.cause?.code || error?.code;
  if (['EACCES', 'EPERM'].includes(transport)) return {
    failureCode: 'network_denied',
    failureMessage: '起動した環境で外部ネットワークへの接続が拒否されました。通常のターミナルからTORIAを起動し、ネットワーク権限を確認してください。',
  };
  const httpMessages = {
    401: ['authentication_failed', 'APIキーの認証に失敗しました。OrcaRouterでキーの有効性を確認してください。'],
    402: ['budget_exceeded', '残高不足、または予算上限に達しています。OrcaRouterのコンソールを確認してください。'],
    403: ['provider_forbidden', 'OrcaRouterが呼び出しを拒否しました。キーの権限と利用可能なモデルを確認してください。'],
    429: ['rate_limited', 'OrcaRouterの呼び出し制限に達しました。しばらく待ってから再試行してください。'],
  };
  if (httpMessages[httpStatus]) {
    const [failureCode, failureMessage] = httpMessages[httpStatus];
    return { failureCode, failureMessage, httpStatus };
  }
  if (Number.isInteger(httpStatus) && httpStatus >= 400) return {
    failureCode: 'provider_error', httpStatus,
    failureMessage: 'モデルサービスがエラーを返しました。しばらくしてから再試行してください。',
  };
  if (['TimeoutError', 'AbortError'].includes(error?.name) || transport === 'UND_ERR_CONNECT_TIMEOUT') return {
    failureCode: 'timeout', failureMessage: '接続またはモデルの応答がタイムアウトしました。ネットワークを確認して再試行してください。',
  };
  if (['ENOTFOUND', 'EAI_AGAIN'].includes(transport)) return {
    failureCode: 'dns_failed', failureMessage: 'OrcaRouterの接続先を確認できません。DNSやネットワーク設定を確認してください。',
  };
  if (['CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'SELF_SIGNED_CERT_IN_CHAIN', 'UNABLE_TO_VERIFY_LEAF_SIGNATURE', 'UNABLE_TO_GET_ISSUER_CERT_LOCALLY'].includes(transport)) return {
    failureCode: 'tls_failed', failureMessage: '接続先の証明書を検証できませんでした。端末の時刻やネットワークの証明書設定を確認してください。',
  };
  if (['invalid_tool', 'invalid_choice', 'invalid_state'].includes(error?.message) || error instanceof SyntaxError) return {
    failureCode: 'invalid_response', failureMessage: 'AIの応答が必要な形式に一致しませんでした。再試行するか、モデル設定を確認してください。',
  };
  return { failureCode: 'request_failed', failureMessage: 'API呼び出しを完了できませんでした。起動環境とネットワーク接続を確認してください。' };
}
