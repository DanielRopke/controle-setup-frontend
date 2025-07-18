import axios from 'axios'

export const API_BASE = import.meta.env.VITE_API_BASE

export const api = {
  getSeccionais: () => axios.get<string[]>(`${API_BASE}/seccionais/`),
  getStatusSAP: () => axios.get<string[]>(`${API_BASE}/status-sap-unicos/`),
  getTipos: () => axios.get<string[]>(`${API_BASE}/tipos-unicos/`),
  getMesesConclusao: () => axios.get<string[]>(`${API_BASE}/meses-conclusao/`),

  getGraficoEner: () => axios.get<Record<string, Record<string, number>>>(`${API_BASE}/status-ener-pep/`),
  getGraficoConc: () => axios.get<Record<string, Record<string, number>>>(`${API_BASE}/status-conc-pep/`),
  getGraficoServico: () => axios.get<Record<string, number>>(`${API_BASE}/status-servico-contagem/`),
  getGraficoSeccionalRS: () => axios.get<Record<string, { valor: number; pep_count: number }>>(`${API_BASE}/seccional-rs-pep/`),

  getMatrizDados: (params: URLSearchParams) => axios.get(`${API_BASE}/matriz-dados/?${params.toString()}`)
}
