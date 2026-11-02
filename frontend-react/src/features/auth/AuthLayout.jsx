import React from "react";

/** Marco de las pantallas previas al ingreso (login, activación, cambio obligatorio de contraseña y selección de área). */
export function AuthLayout({ eyebrow = "SISTEMA INSTITUCIONAL", title, lead, children }) {
  return (
    <main className="login" id="main-content">
      <section className="login-intro">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
      </section>
      {children}
    </main>
  );
}
