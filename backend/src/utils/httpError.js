/**
 * Error carrying an HTTP status; mapped to a JSON response by the global error handler.
 * The optional machine-readable `code` (e.g. "INSUFFICIENT_FUNDS") is returned to the client as-is.
 */
class HttpError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    if (code) this.code = code;
  }
}

module.exports = { HttpError };
