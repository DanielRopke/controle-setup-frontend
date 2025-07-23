

export function processarDados(
  dados: Array<{ status: string; count: number; seccional?: string }>,
  ignorarFechada = false,
  filtros?: { seccionais?: string[] }
) {
  return Object.entries(
    dados.filter(item => {
      const matchSeccional = !filtros?.seccionais?.length || (item.seccional && filtros.seccionais.includes(item.seccional))
      const matchStatus = ignorarFechada ? !["fechado", "fechada"].includes(item.status.toLowerCase()) : true
      return matchSeccional && matchStatus
    }).reduce((acc: Record<string, number>, curr) => {
      acc[curr.status] = (acc[curr.status] || 0) + curr.count
      return acc
    }, {})
  ).map(([status, count]) => ({ status, count }))
}
