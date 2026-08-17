// ============================================================
// AgroRisk · Coordenadas aproximadas das áreas e clientes
// Usadas pelos adapters enquanto o GPS real não está disponível.
// Baseadas nas cidades dos clientes mock (Sorriso/MT, Cascavel/PR, Rio Verde/GO).
// ============================================================

export interface LatLon {
  lat: number;
  lon: number;
}

/** Coordenadas aproximadas por areaId */
export const AREA_COORDS: Record<string, LatLon> = {
  "AR-01": { lat: -12.5502, lon: -55.7220 }, // Talhão Norte · Sorriso/MT
  "AR-02": { lat: -12.5680, lon: -55.7380 }, // Talhão Sul · Sorriso/MT
  "AR-03": { lat: -24.9578, lon: -53.4595 }, // Talhão Leste · Cascavel/PR
  "AR-04": { lat: -24.9720, lon: -53.4850 }, // Setor Oeste · Cascavel/PR
  "AR-05": { lat: -17.7989, lon: -50.9267 }, // Pátio Central · Rio Verde/GO
};

/** Coordenadas por clientId */
export const CLIENT_COORDS: Record<string, LatLon> = {
  "CL-01": { lat: -12.5502, lon: -55.7220 }, // Fazenda Santa Clara · Sorriso/MT
  "CL-02": { lat: -24.9578, lon: -53.4595 }, // Agro Vale Norte · Cascavel/PR
  "CL-03": { lat: -17.7989, lon: -50.9267 }, // Grupo Terra Forte · Rio Verde/GO
};

export function getAreaCoords(areaId: string): LatLon {
  return AREA_COORDS[areaId] ?? { lat: -12.5502, lon: -55.7220 };
}

export function getClientCoords(clientId: string): LatLon {
  return CLIENT_COORDS[clientId] ?? { lat: -12.5502, lon: -55.7220 };
}
