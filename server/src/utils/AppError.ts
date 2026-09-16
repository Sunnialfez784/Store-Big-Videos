export class AppError extends Error {
  public readonly status: number;
  public readonly details: string[];

  constructor(status: number, message: string, details: string[] = []) {
    super(message);
    this.status = status;
    this.details = details;
    Error.captureStackTrace?.(this, AppError);
  }

  static badRequest(m: string, d: string[] = []) { return new AppError(400, m, d); }
  static unauthorized(m = 'You need to sign in to do that.') { return new AppError(401, m); }
  static forbidden(m = 'You do not have access to this video.') { return new AppError(403, m); }
  static notFound(m = 'Video not found.') { return new AppError(404, m); }
  static conflict(m: string) { return new AppError(409, m); }
  static payloadTooLarge(m: string) { return new AppError(413, m); }
  static unsupportedMedia(m: string) { return new AppError(415, m); }
  static storage(m = 'Storage is unavailable right now. Try again in a moment.') { return new AppError(502, m); }
}
