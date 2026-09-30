/** An error caused by the request, whose message is safe to send back to the client with `status`. */
export class AgendashError extends Error {
  override name = 'AgendashError';

  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}
