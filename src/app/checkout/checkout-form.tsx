"use client";

import { useActionState } from "react";
import { checkoutAction, type CheckoutState } from "../actions";

export function CheckoutForm() {
  const [state, action, pending] = useActionState<CheckoutState, FormData>(checkoutAction, {});
  const err = (field: string) =>
    state.fieldErrors?.[field]?.[0] && <span className="field-error">{state.fieldErrors[field][0]}</span>;

  return (
    <form action={action} className="form card" noValidate key={JSON.stringify(state.values ?? {})}>
      {state.error && (
        <p className="alert" role="alert">
          {state.error}
        </p>
      )}
      <label>
        Full name
        <input name="customerName" autoComplete="name" defaultValue={state.values?.customerName} required />
        {err("customerName")}
      </label>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" defaultValue={state.values?.email} required />
        {err("email")}
      </label>
      <label>
        Delivery address
        <textarea name="address" rows={3} autoComplete="street-address" defaultValue={state.values?.address} required />
        {err("address")}
      </label>
      <button className="btn primary block" disabled={pending}>
        {pending ? "Placing order…" : "Continue to payment"}
      </button>
    </form>
  );
}
