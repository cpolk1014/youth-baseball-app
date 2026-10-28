// Where team messages go. GroupMe today; another channel (SMS, email) can implement the
// same interface later. Messages always go to the team's group, never to one person.

export interface TeamChannel {
  /** Post a message to the team's group. Throws ChannelError with a message people can act on. */
  post(text: string): Promise<void>;
}

export class ChannelError extends Error {
  constructor(
    message: string,
    /** HTTP status to return to the app. */
    readonly status = 502,
  ) {
    super(message);
  }
}
