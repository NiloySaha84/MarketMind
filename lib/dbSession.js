/** Set RLS session vars (transaction-local when used inside BEGIN/COMMIT). */
export const setRLSUser = (client, userId) =>
    client.query("SELECT set_config('app.user_id', $1, true)", [String(userId)]);

export const setLoginEmail = (client, email) =>
    client.query("SELECT set_config('app.login_email', $1, true)", [email]);
