"use client";

import { useActionState } from "react";
import { adminLoginAction } from "../../actions";

export default function AdminLoginPage() {
  const [state, action, pending] = useActionState(adminLoginAction, {});
  return (
    <form action={action} className="form card narrow">
      <h1>Admin sign in</h1>
      {state.error && (
        <p className="alert" role="alert">
          {state.error}
        </p>
      )}
      <label>
        Password
        <input type="password" name="password" autoComplete="current-password" required />
      </label>
      <button className="btn primary block" disabled={pending}>
        Sign in
      </button>
    </form>
  );
}
