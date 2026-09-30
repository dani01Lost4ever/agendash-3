/** An error caused by the request, whose message is safe to send back to the client. */
export class AgendashError extends Error {
  override name = 'AgendashError';
}
