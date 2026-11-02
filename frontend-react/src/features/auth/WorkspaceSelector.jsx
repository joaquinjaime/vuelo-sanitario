import React from "react";
import { useSession } from "../../app/providers/SessionProvider";
import { AuthLayout } from "./AuthLayout";

/** Usuarios con más de un rol: eligen con qué área trabajar. Se puede cambiar luego desde el menú de usuario. */
export function WorkspaceSelector({ workspaces: workspacesProp, select: selectProp }) {
  const session = useSession();
  const workspaces = workspacesProp || session.workspaces, select = selectProp || session.selectWorkspace;
  return (
    <AuthLayout eyebrow="ÁREAS HABILITADAS" title="Seleccione el área de trabajo" lead="Su cuenta tiene más de un rol. Puede cambiar de área en cualquier momento desde el menú de usuario.">
      <div className="auth-card" role="group" aria-label="Áreas de trabajo">
        <h2>¿Con qué área desea trabajar?</h2>
        {workspaces.map((area) => <button key={area.id} type="button" onClick={() => select(area.id)}>{area.label}</button>)}
      </div>
    </AuthLayout>
  );
}
