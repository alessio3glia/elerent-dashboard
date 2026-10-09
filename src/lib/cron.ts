/** Vercel Cron invia "Authorization: Bearer $CRON_SECRET". */
export function isAuthorizedCron(request: Request) {
  const secret = process.env.CRON_SECRET;
  return !!secret && request.headers.get("authorization") === `Bearer ${secret}`;
}
