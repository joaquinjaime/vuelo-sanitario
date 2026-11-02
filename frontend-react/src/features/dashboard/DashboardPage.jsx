import React from "react";
import { useSession } from "../../app/providers/SessionProvider";
import { AdminDashboard } from "./AdminDashboard";
import { DtsDashboard } from "./DtsDashboard";
import { OperationsDashboard } from "./OperationsDashboard";
import { CommanderDashboard } from "./CommanderDashboard";

const BY_WORKSPACE = { ADMIN: AdminDashboard, DTS: DtsDashboard, OPERACIONES: OperationsDashboard, COMANDANTE: CommanderDashboard };

/** Pantalla de inicio: el panel depende del área de trabajo activa. */
export function DashboardPage() {
  const { workspace } = useSession();
  const Panel = BY_WORKSPACE[workspace];
  return Panel ? <Panel /> : null;
}
