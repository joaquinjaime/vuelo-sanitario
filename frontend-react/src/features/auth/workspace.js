export const workspaceForRoles = (roles = []) => {
  const spaces=[];
  if(roles.includes("ADMINISTRADOR"))spaces.push({id:"ADMIN",label:"Administración"});
  if(roles.includes("DTS"))spaces.push({id:"DTS",label:"Dirección de Tránsito Sanitario"});
  if(roles.includes("OPERACIONES")||roles.includes("CENTRO_OPERACIONES"))spaces.push({id:"OPERACIONES",label:"Centro de Operaciones"});
  if(roles.includes("COMANDANTE"))spaces.push({id:"COMANDANTE",label:"Comandante"});
  return spaces;
};
