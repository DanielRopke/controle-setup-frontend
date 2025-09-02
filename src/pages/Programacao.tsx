// Página Programacao: baseada na estrutura de PrazosSAP, sem os gráficos de colunas
import React, { useEffect, useState, useRef } from 'react';
import ContextMenu from '../components/ContextMenu';
import { useNavigate } from 'react-router-dom';
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Copy, RotateCcw, Menu, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import * as XLSX from 'xlsx';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { PEPSearch } from '../components/PEPSearch';
import { cn } from "../lib/utils";
import { getProgramacao } from '../services/api';
import type { MatrizItem } from '../services/api';
import { showToast } from '../components/toast';
import LogoSetup from '../assets/LogoSetup1.png';
import { FundoAnimado } from '../components/FundoAnimado';

export default function Programacao() {
  const navigate = useNavigate();
  const [selectedRegion, setSelectedRegion] = useState<string>('all');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pepSearch, setPepSearch] = useState('');
  const [selectedStartDate, setSelectedStartDate] = useState<Date | undefined>(undefined);
  const [selectedEndDate, setSelectedEndDate] = useState<Date | undefined>(undefined);
  const [selectedStatusSap, setSelectedStatusSap] = useState<string>('');
  const [selectedTipo, setSelectedTipo] = useState<string>('');
  const [selectedMes, setSelectedMes] = useState<string>('');
  const [selectedMatrixRows, setSelectedMatrixRows] = useState<string[]>([]);
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  // Context menu state
  const [contextOpen, setContextOpen] = useState(false);
  const [contextPos, setContextPos] = useState({ x: 0, y: 0 });
  const [contextItems, setContextItems] = useState<{ id: string; label: string; onClick: () => void }[]>([]);

  useEffect(() => {
    void contextOpen; void contextPos; void contextItems;
  }, [contextOpen, contextPos, contextItems]);

  type MatrixRow = {
    data: string;
    pep: string; // PEP/ORDEM
    valorProgramado: number;
    valorConcluido: number;
    valorParcial: number;
    valorCancelado: number;
    statusProg: string;
    motivoNaoCumprimento: string;
    motivoPrioridade: string;
    prioridade: string;
  };
  const [sortConfig, setSortConfig] = useState<{ key?: keyof MatrixRow; direction?: 'asc' | 'desc' }>({});
  const [regions, setRegions] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<MatrizItem[]>([]);
  const [loadingSheet, setLoadingSheet] = useState(false);
  const [statusSapList, setStatusSapList] = useState<string[]>([]);
  const [tiposList, setTiposList] = useState<string[]>([]);
  const [mesesList, setMesesList] = useState<string[]>([]);

  useEffect(() => {
    const prevTitle = document.title;
    document.title = 'Programação';
    return () => { document.title = prevTitle; };
  }, []);

  const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

  const clearFilters = () => {
    setSelectedRegion('all');
    setActiveFilters({});
    setSelectedStartDate(undefined);
    setSelectedEndDate(undefined);
    setPepSearch('');
    setSelectedStatusSap('');
    setSelectedTipo('');
    setSelectedMes('');
    showToast('Filtros limpos!');
  };

  const clearPepSearch = () => { setPepSearch(''); showToast('Pesquisa PEP limpa!'); };

  const handleSort = (key: keyof MatrixRow) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') direction = 'desc';
    setSortConfig({ key, direction });
  };

  const getSortIcon = (columnKey: keyof MatrixRow) => {
    if (sortConfig.key !== columnKey) return <ChevronsUpDown className="w-4 h-4 text-gray-500" />;
    return sortConfig.direction === 'asc' ? <ChevronUp className="w-4 h-4 text-green-600" /> : <ChevronDown className="w-4 h-4 text-green-600" />;
  };

  // Ref para o wrapper da tabela (usado para rolamento automático)
  const tableWrapperRef = useRef<HTMLDivElement | null>(null);

  const scrollToRow = (idx: number) => {
    try {
      const container = tableWrapperRef.current;
      let el: HTMLElement | null = null;
      if (container) el = container.querySelector(`[data-row-index="${idx}"]`);
      if (!el) el = document.querySelector(`[data-row-index="${idx}"]`);
      if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    } catch (err) { console.debug('scrollToRow error', err); }
  };

  // Dados calculados (mantém estrutura para matriz e filtros)
  const filteredData = React.useMemo(() => {
    const anyHasEner = rawRows.some(r => (r.statusEner || '').trim());
    const anyHasConc = rawRows.some(r => (r.statusConc || '').trim());
    const anyHasMotivos = rawRows.some(r => (r.statusServico || '').trim());

    const regionFilterForOthers = (activeFilters.comparison || (selectedRegion !== 'all' ? selectedRegion : undefined)) as string | undefined;
    let rowsForOthers = rawRows;
    if (regionFilterForOthers) rowsForOthers = rowsForOthers.filter(r => (r.seccional || '').trim() === regionFilterForOthers);
  // Aplicar filtros selecionados localmente (usando colunas da aba 'programação')
    if (selectedStatusSap) rowsForOthers = rowsForOthers.filter(r => (r.statusSap || '').trim() === selectedStatusSap);
    if (selectedTipo) rowsForOthers = rowsForOthers.filter(r => (r.tipo || '').trim() === selectedTipo);
    if (selectedMes) rowsForOthers = rowsForOthers.filter(r => {
      const rowObj = r as unknown as Record<string, unknown>;
      return String(rowObj['anoCiclo'] ?? rowObj['Ano ciclo'] ?? '').trim() === selectedMes;
    });
    if (activeFilters.statusENER && anyHasEner) rowsForOthers = rowsForOthers.filter(r => (r.statusEner || '').trim() === activeFilters.statusENER);
    if (activeFilters.statusCONC && anyHasConc) rowsForOthers = rowsForOthers.filter(r => (r.statusConc || '').trim() === activeFilters.statusCONC);
    if (activeFilters.reasons && anyHasMotivos) rowsForOthers = rowsForOthers.filter(r => (r.statusServico || '').trim() === activeFilters.reasons);
    if (pepSearch.trim()) rowsForOthers = rowsForOthers.filter(r => (r.pep || '').toLowerCase().includes(pepSearch.toLowerCase()));

  // (Gráficos removidos nesta página) — não precisamos de agregações específicas aqui

    // Para a matriz: mapear para as colunas solicitadas
    let tableRows = rowsForOthers.map(r => {
      const rowObj = r as unknown as Record<string, unknown>;
      const parseMoney = (v: unknown) => {
        if (v == null) return 0;
        if (typeof v === 'number') return v;
        const s = String(v);
        const cleaned = s.replace(/R\$/i, '').replace(/\./g, '').replace(/,/g, '.').trim();
        const n = parseFloat(cleaned);
        return Number.isNaN(n) ? 0 : n;
      };
      return {
        data: String(rowObj['DATA'] ?? rowObj['Data'] ?? ''),
        pep: String(rowObj['PEP/ORDEM'] ?? rowObj['PEP'] ?? rowObj['pep'] ?? ''),
        valorProgramado: parseMoney(rowObj['Valor programado'] ?? rowObj['Valor Programado'] ?? rowObj['valorProgramado'] ?? rowObj['valor'] ?? 0),
        valorConcluido: parseMoney(rowObj['Valor concluído'] ?? rowObj['Valor Concluído'] ?? rowObj['valorConcluido'] ?? 0),
        valorParcial: parseMoney(rowObj['Valor parcial'] ?? rowObj['Valor Parcial'] ?? rowObj['valorParcial'] ?? 0),
        valorCancelado: parseMoney(rowObj['Valor cancelado'] ?? rowObj['Valor Cancelado'] ?? rowObj['valorCancelado'] ?? 0),
        statusProg: String(rowObj['STATUS RETORNO PROG 2'] ?? rowObj['STATUS RETORNO PROG'] ?? rowObj['statusSap'] ?? ''),
        motivoNaoCumprimento: String(rowObj['MOTIVO NÃO CUMPRIMENTO DA PROG'] ?? rowObj['Motivo Não Cumprimento'] ?? ''),
        motivoPrioridade: String(rowObj['Motivo Prioridade'] ?? rowObj['motivoPrioridade'] ?? ''),
        prioridade: String(rowObj['Prioridade'] ?? rowObj['prioridade'] ?? ''),
      } as MatrixRow;
    });

      if (sortConfig.key) {
      const parseDate = (s: string): number => {
        if (!s) return Number.NaN;
        const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (m) {
          const d = Number(m[1]); const mo = Number(m[2]) - 1; const y = Number(m[3]); return new Date(y, mo, d).getTime();
        }
        const t = Date.parse(s); return Number.isNaN(t) ? Number.NaN : t;
      };
      const compareNumbers = (x: number, y: number) => {
        if (Number.isNaN(x) && Number.isNaN(y)) return 0;
        if (Number.isNaN(x)) return 1; if (Number.isNaN(y)) return -1; return x - y;
      };
      tableRows = [...tableRows].sort((a, b) => {
        const key = sortConfig.key! as keyof typeof tableRows[0];
        const dir = sortConfig.direction === 'asc' ? 1 : -1;
        const aValue = a[key]; const bValue = b[key];
        // numeric fields
        if (key === 'valorProgramado' || key === 'valorConcluido' || key === 'valorParcial' || key === 'valorCancelado') return dir * (Number(aValue) - Number(bValue));
        if (key === 'data') {
          const da = parseDate(String(aValue)); const db = parseDate(String(bValue)); return dir * compareNumbers(da, db);
        }
        const aStr = String(aValue || '').toLowerCase(); const bStr = String(bValue || '').toLowerCase();
        if (aStr < bStr) return -1 * dir; if (aStr > bStr) return 1 * dir; return 0;
      });
    }

  return { matrix: tableRows } as { matrix: MatrixRow[] };
  }, [rawRows, selectedRegion, activeFilters, pepSearch, sortConfig, selectedStatusSap, selectedTipo, selectedMes]);

  // Handler de teclado para seleção/rolagem, reaproveitado da outra página
  useEffect(() => {
    const handler = (ev: KeyboardEvent) => {
      const active = document.activeElement as HTMLElement | null;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;
      const rows = (filteredData && Array.isArray(filteredData.matrix)) ? filteredData.matrix : [];
      if (!rows.length) return;
      if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.key === 'ArrowDown') {
        ev.preventDefault();
        const start = (typeof lastSelectedIndex === 'number' && lastSelectedIndex >= 0) ? lastSelectedIndex : 0;
        const toSelect = rows.slice(start).map(r => r.pep);
        setSelectedMatrixRows(prev => {
          const prefix = Array.isArray(prev) ? prev.filter(p => { const idx = rows.findIndex(r => r.pep === p); return idx >= 0 && idx < start; }) : [];
          return Array.from(new Set([...prefix, ...toSelect]));
        });
        setLastSelectedIndex(rows.length - 1); scrollToRow(rows.length - 1); return;
      }
      if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
        ev.preventDefault();
        let current = typeof lastSelectedIndex === 'number' && lastSelectedIndex >= 0 ? lastSelectedIndex : -1;
        if (current === -1 && Array.isArray(selectedMatrixRows) && selectedMatrixRows.length) {
          const firstPep = selectedMatrixRows[0]; const idx = rows.findIndex(r => r.pep === firstPep); if (idx >= 0) current = idx;
        }
        const dir = ev.key === 'ArrowDown' ? 1 : -1; let next = current + dir; if (next < 0) next = 0; if (next > rows.length - 1) next = rows.length - 1;
        if (ev.shiftKey && current >= 0) {
          const start = Math.min(current, next); const end = Math.max(current, next); const range = rows.slice(start, end + 1).map(r => r.pep);
          setSelectedMatrixRows(prev => {
            const preserved = Array.isArray(prev) ? prev.filter(p => { const idx = rows.findIndex(r => r.pep === p); return idx === -1 || idx < start || idx > end; }) : [];
            return Array.from(new Set([...preserved, ...range]));
          });
          setLastSelectedIndex(next); scrollToRow(next); return;
        }
        setSelectedMatrixRows([rows[next].pep]); setLastSelectedIndex(next); scrollToRow(next); return;
      }
    };
    document.addEventListener('keydown', handler); return () => document.removeEventListener('keydown', handler);
  }, [lastSelectedIndex, filteredData, selectedMatrixRows]);

  // Atualiza lista de regiões conforme dados carregados
  useEffect(() => {
    const m = new Map<string, number>();
    for (const r of rawRows) {
      const s = (r.seccional || '').trim(); if (!s) continue; const v = typeof r.valor === 'number' ? r.valor : parseFloat(String(r.valor || '0').replace(/R\$\s?/, '').replace(/\./g, '').replace(/,/g, '.')) || 0; m.set(s, (m.get(s) || 0) + v);
    }
    const regionList = Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([name]) => name); setRegions(regionList);
  }, [rawRows]);

  // Derivar listas dos filtros a partir dos dados carregados da aba 'programação'
  useEffect(() => {
    // statusSapList => Status Prog (coluna STATUS RETORNO PROG*)
    // tiposList => Mês Ciclo (coluna 'Mês Ciclo')
    // mesesList => Ano ciclo (coluna 'Ano ciclo')
    const invalid = new Set(['', null, undefined, '#N/A', 'N/A', 'na', 'NaN']);
    const statusSet = new Set<string>();
    const mesCicloSet = new Set<string>();
    const anoSet = new Set<string>();
    for (const r of rawRows) {
      const s = (r.statusSap || '').toString().trim();
      const mes = (r.tipo || '').toString().trim(); // tipo conterá 'Mês Ciclo' ao carregar
      const ano = String((r as unknown as Record<string, unknown>).anoCiclo ?? '').trim();
      if (s && !invalid.has(s)) statusSet.add(s);
      if (mes && !invalid.has(mes)) mesCicloSet.add(mes);
      if (ano && !invalid.has(ano)) anoSet.add(ano);
    }
    setStatusSapList(Array.from(statusSet).sort());
    setTiposList(Array.from(mesCicloSet).sort());
    setMesesList(Array.from(anoSet).sort());
  }, [rawRows]);

  // A matriz será carregada via botão "Carregar Planilha" (loadFromProgramacao).
  // Não buscamos aqui `matriz-dados` para evitar usar a aba 'Prazos SAP'.

  // Carregar automaticamente ao montar a página (comportamento semelhante a PrazosSAP)
  useEffect(() => {
    void loadFromProgramacao();
    // assumimos carregamento apenas na montagem — filtros cliente permanecem locais
  }, []);

  // Carregar dados da aba 'programação' usando o backend (recomendado)
  async function loadFromProgramacao() {
    setLoadingSheet(true);
    try {
      const res = await getProgramacao();
  const data = (res.data || []) as Record<string, unknown>[];
      // Mapear e preservar colunas originais; também adicionar chaves normalizadas usadas pela UI
      const mapped = data.map((row) => {
        const r = row as Record<string, unknown>;
        // normaliza as chaves da linha para facilitar lookup (remove acentos, espaços e lower-case)
        const normalizeKey = (s: string | undefined) => {
          if (!s) return '';
          // normalize NFD and strip combining diacritics (common approach)
          const nfd = s.toString().normalize('NFD');
          const withoutDiacritics = nfd.replace(/[\u0300-\u036f]/g, '');
          // remove non-alphanumeric chars and spaces, then lowercase
          return withoutDiacritics.replace(/[^A-Za-z0-9]/g, '').toLowerCase();
        };
        const normMap = new Map<string, unknown>();
        for (const [k, v] of Object.entries(r || {})) normMap.set(normalizeKey(k), v);
        const get = (keys: (string | undefined)[]) => {
          for (const k of keys) {
            if (!k) continue;
            const nk = normalizeKey(k);
            if (normMap.has(nk)) {
              const val = normMap.get(nk);
              if (val !== undefined && val !== null) return val;
            }
          }
          return undefined;
        };
        const parseStr = (v: unknown) => v == null ? '' : String(v);
        const parseNumber = (v: unknown) => {
          if (v == null) return 0;
          if (typeof v === 'number') return v;
          const s = String(v);
          const cleaned = s.replace(/R\$/i, '').replace(/\./g, '').replace(/,/g, '.').trim();
          const n = parseFloat(cleaned);
          return Number.isNaN(n) ? 0 : n;
        };

        // Campos originais possíveis
        const DATA = parseStr(get(['DATA', 'Data', 'data', 'DATA CONCLUSÃO', 'Data Conclusão']));
        const PEP_ORDEM = parseStr(get(['PEP/ORDEM', 'PEP', 'pep', 'Serviço', 'servico']));
        const STATUS_PROG = parseStr(get(['STATUS RETORNO PROG 2', 'STATUS RETORNO PROG', 'Status Retorno Prog', 'statusSap']));
        const MOTIVO_NAO_CUMPRIMENTO = parseStr(get(['MOTIVO NÃO CUMPRIMENTO DA PROG', 'Motivo Não Cumprimento', 'motivoNaoCumprimento', 'MOTIVO NÃO CUMPRIMENTO']));
        const MOTIVO_PRIORIDADE = parseStr(get(['Motivo Prioridade', 'motivoPrioridade']));
        const PRIORIDADE = parseStr(get(['Prioridade', 'prioridade']));

        // Valores financeiros separados na planilha
        const VAL_PROG = get(['Valor programado', 'Valor Programado', 'valorProgramado', 'Valor programado (R$)', 'Valor Programado (R$)']);
        const VAL_CONC = get(['Valor concluído', 'Valor Concluído', 'valorConcluido']);
        const VAL_PAR = get(['Valor parcial', 'Valor Parcial', 'valorParcial']);
        const VAL_CAN = get(['Valor cancelado', 'Valor Cancelado', 'valorCancelado']);

        const valorProgramado = parseNumber(VAL_PROG);
        const valorConcluido = parseNumber(VAL_CONC);
        const valorParcial = parseNumber(VAL_PAR);
        const valorCancelado = parseNumber(VAL_CAN);

        const pep = PEP_ORDEM;
        const prazo = parseStr(get(['PRAZO', 'Prazo', 'prazo']));
        const dataConclusao = parseStr(get(['DATA CONCLUSÃO', 'Data Conclusão', 'dataConclusao', 'DATA']));
        const seccional = parseStr(get(['Seccional Equipe', 'Seccional', 'SECCIONAL', 'seccional']));
        const mesCiclo = parseStr(get(['Mês Ciclo', 'Mes Ciclo', 'MesCiclo', 'tipo']));
        const anoCiclo = parseStr(get(['Ano ciclo', 'AnoCiclo', 'Ano']));

        // criar objeto que preserva campos originais e adiciona normalizados
        const out: Record<string, unknown> = { ...(r || {}) };
        // campos originais/compatíveis
        out['DATA'] = DATA;
        out['PEP/ORDEM'] = PEP_ORDEM;
        out['STATUS RETORNO PROG 2'] = STATUS_PROG;
        out['MOTIVO NÃO CUMPRIMENTO DA PROG'] = MOTIVO_NAO_CUMPRIMENTO;
        out['Motivo Prioridade'] = MOTIVO_PRIORIDADE;
        out['Prioridade'] = PRIORIDADE;
        out['Valor programado'] = VAL_PROG ?? valorProgramado;
        out['Valor concluído'] = VAL_CONC ?? valorConcluido;
        out['Valor parcial'] = VAL_PAR ?? valorParcial;
        out['Valor cancelado'] = VAL_CAN ?? valorCancelado;

        // campos normalizados usados pelo resto do código
        out['pep'] = pep;
        out['prazo'] = prazo;
        out['dataConclusao'] = dataConclusao;
        out['statusSap'] = STATUS_PROG;
        out['valorProgramado'] = valorProgramado;
        out['valorConcluido'] = valorConcluido;
        out['valorParcial'] = valorParcial;
        out['valorCancelado'] = valorCancelado;
  const fallbackValor = (r['R$'] ?? r['RS'] ?? r['VALOR'] ?? r['valor'] ?? 0) as unknown as number | string;
  out['valor'] = valorProgramado || valorConcluido || valorParcial || valorCancelado || fallbackValor;
        out['seccional'] = seccional;
        out['tipo'] = mesCiclo;
        out['anoCiclo'] = anoCiclo;
        out['statusEner'] = r['Status ENER'] ?? r['STATUS ENER'] ?? undefined;
        out['statusConc'] = r['Status CONC'] ?? r['STATUS CONC'] ?? undefined;
        out['statusServico'] = r['status serviço'] ?? r['STATUS SERVIÇO'] ?? undefined;

        return out as unknown as MatrizItem & Record<string, unknown>;
      });
      setRawRows(mapped as unknown as MatrizItem[]);
      showToast(`Programação carregada: ${mapped.length} linhas`);
    } catch (err) {
      console.error('Erro ao carregar programacao:', err);
      showToast('Erro ao carregar programação via backend. Verifique logs do servidor.');
    } finally {
      setLoadingSheet(false);
    }
  }

  // Exportar Excel
  const handleExportExcel = () => {
  const worksheet = XLSX.utils.json_to_sheet(filteredData.matrix.map(row => ({ 'Data': row.data, 'Serviço': row.pep, 'Programado': row.valorProgramado, 'Concluido': row.valorConcluido, 'Parcial': row.valorParcial, 'Cancelado': row.valorCancelado, 'Status': row.statusProg, 'Motivo': row.motivoNaoCumprimento, '#': getHashEmoji(row) })));
    const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, 'Programacao'); XLSX.writeFile(workbook, 'programacao.xlsx'); showToast('Arquivo Excel exportado com sucesso!');
  };

  // Retorna o emoji apropriado para a coluna '#'
    const getHashEmoji = (row: Record<string, unknown>): string => {
      const rowAny = row as Record<string, unknown>;
      const rawHash = rowAny['#'] ?? rowAny['Hash'] ?? rowAny['hash'];
      const candidate = rawHash ?? rowAny['prioridade'] ?? rowAny['Motivo Prioridade'] ?? rowAny['motivoPrioridade'] ?? rowAny['statusProg'] ?? rowAny['statusSap'] ?? '';
        // normalize, remove diacritics and non-alphanumerics, then lowercase
        const normalized = String(candidate || '').normalize('NFD').replace(/[^\u0000-\u007F]/g, m => m).replace(/[^\u0000-\u007F]/g, m => m);
        const noDiacritics = normalized.replace(/[^\u0000-\u007F]/g, '');
        const v = String(candidate || '')
          .normalize('NFD')
          .replace(/[^\u0000-\u007F]/g, '')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-zA-Z0-9]/g, '')
          .toLowerCase();
        if (!v) return '';
        // match roots to be tolerant: 'vermelh' covers 'vermelho' and variants
        if (v.includes('vermelh') || v.includes('red')) return '🔴';
        if (v.includes('amarel') || v.includes('yellow')) return '🟡';
        if (v.includes('caveir') || v.includes('skull') || v.includes('☠')) return '💀';
      return '';
    };

  const totalValue = React.useMemo(() => filteredData.matrix.reduce((sum, row) => sum + (row.valorProgramado || 0), 0), [filteredData.matrix]);
  const totalPep = React.useMemo(() => filteredData.matrix.length, [filteredData.matrix.length]);

  return (
    <div className="relative z-10 min-h-screen bg-transparent lovable">
      <FundoAnimado showBadge={false} />
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-green-500 shadow-md bg-gradient-to-r from-green-600 via-green-600/90 to-green-700">
        <div className="relative flex items-center justify-between h-16 px-4 pr-8 lg:px-6">
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <h1 className="font-inter text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-wide leading-none text-white drop-shadow-[0_3px_6px_rgba(0,0,0,0.35)]">Programação</h1>
          </div>
          <div className="flex items-center gap-3 lg:gap-6">
            <Button variant="outline" size="sm" onClick={() => setSidebarOpen(!sidebarOpen)} className="flex items-center gap-2 text-gray-700 transition-all duration-200 bg-white border-gray-300 shadow-md lg:hidden rounded-xl hover:shadow-lg hover:bg-gray-50">
              <Menu className="w-4 h-4" />
            </Button>
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center px-2 ml-4 overflow-hidden font-bold text-center bg-white shadow-md cursor-pointer rounded-xl hover:shadow-lg hover:bg-gray-50" onClick={() => navigate('/obras')} title="Ir para Obras" role="button" tabIndex={0}>
                <img src={LogoSetup} alt="Grupo Setup" className="object-contain w-auto h-10 max-w-full" />
              </div>
              <Button variant="outline" size="sm" onClick={clearFilters} title="Limpar filtros" className="flex items-center justify-center w-10 h-10 p-0 text-gray-700 transition-all duration-200 bg-white border-gray-300 shadow-md rounded-xl hover:shadow-lg hover:bg-gray-50">
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 lg:gap-4">
            <div className="flex items-center gap-2 lg:gap-3">
              <span className="hidden text-xs text-white lg:text-sm sm:inline">Valor Total</span>
              <div className="px-2 py-1 text-sm font-semibold text-green-600 bg-white rounded-lg shadow-md lg:px-4 lg:py-2 lg:rounded-xl lg:text-base w-[105px] text-center whitespace-nowrap">R$ {totalValue.toLocaleString('pt-BR')}</div>
            </div>
            <div className="flex items-center gap-2 lg:gap-3">
              <span className="hidden text-xs text-white lg:text-sm sm:inline">PEP</span>
              <div className="px-2 py-1 text-sm font-semibold text-green-600 bg-white rounded-lg shadow-md lg:px-4 lg:py-2 lg:rounded-xl lg:text-base w-[105px] text-center whitespace-nowrap">{totalPep}</div>
            </div>
          </div>
        </div>
      </header>

  <div className="relative flex" style={{ paddingTop: 'calc(4rem + 16px)' }}>
        {sidebarOpen && (<div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />)}

        <aside className={cn("fixed left-0 top-16 bottom-0 w-64 bg-white border-r border-gray-200 shadow-md overflow-y-auto z-50 transition-transform duration-300","lg:translate-x-0 lg:fixed lg:z-auto lg:h-[calc(100vh-4rem)]", sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0")} style={{ direction: 'rtl' }}>
          <div className="p-4 space-y-4 lg:p-6 lg:space-y-6" style={{ direction: 'ltr' }}>
            <div className="space-y-3">
              <h3 className="text-sm font-semibold tracking-wider text-gray-500 uppercase">Regiões</h3>
              <div className="space-y-2">
                {regions.map((region) => (
                  <Button key={region} variant={selectedRegion === region ? "default" : "outline"} onClick={() => { setSelectedRegion(selectedRegion === region ? 'all' : region); setSidebarOpen(false); }} className="justify-start w-full text-sm transition-all duration-200 shadow-md rounded-xl hover:shadow-lg" size="sm">{region}</Button>
                ))}
              </div>
            </div>

            <div className="pt-4 space-y-3 border-t border-gray-200">
              <h3 className="text-sm font-semibold tracking-wider text-gray-500 uppercase">Filtros</h3>
              <select value={selectedStatusSap} onChange={(e) => setSelectedStatusSap(e.target.value)} className={`w-full h-10 px-3 text-sm border rounded-xl shadow-md transition-all duration-200 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${selectedStatusSap ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-900 border-gray-200'}`}>
                <option value="">Status Prog</option>
                {statusSapList.map((s) => (<option key={s} value={s}>{s}</option>))}
              </select>
              <select value={selectedTipo} onChange={(e) => setSelectedTipo(e.target.value)} className={`w-full h-10 px-3 text-sm border rounded-xl shadow-md transition-all duration-200 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${selectedTipo ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-900 border-gray-200'}`}>
                <option value="">Mês Ciclo</option>
                {tiposList.map((t) => (<option key={t} value={t}>{t}</option>))}
              </select>
              <select value={selectedMes} onChange={(e) => setSelectedMes(e.target.value)} className={`w-full h-10 px-3 text-sm border rounded-xl shadow-md transition-all duration-200 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${selectedMes ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-900 border-gray-200'}`}>
                <option value="">Ano ciclo</option>
                {mesesList.map((m) => (<option key={m} value={m}>{m}</option>))}
              </select>
            </div>

            <div className="pt-4 border-t border-gray-200">
              <DateRangeFilter startDate={selectedStartDate} endDate={selectedEndDate} onStartDateChange={setSelectedStartDate} onEndDateChange={setSelectedEndDate} />
            </div>

            <div className="pt-4 border-t border-gray-200">
              <PEPSearch searchValue={pepSearch} onSearchChange={setPepSearch} onClearSearch={clearPepSearch} />
            </div>
          </div>
        </aside>

        <main className="flex-1 w-full p-2 sm:p-4 lg:p-6 lg:ml-64">
          <div className="mb-8">
            {/* Removido o grid de gráficos; página foca em Programação e matriz */}
          </div>

          <Card className="bg-white border-gray-200 shadow-card hover:shadow-card-hover">
            <CardHeader className="flex flex-row items-center justify-between bg-white border-b border-gray-300 rounded-t-xl">
              <CardTitle className="text-lg font-semibold text-secondary-foreground">Matriz de Programação</CardTitle>
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleExportExcel} className="flex items-center gap-2 text-gray-700 transition-all duration-200 bg-white border border-gray-300 shadow-md rounded-xl hover:bg-gray-50 hover:shadow-lg focus:outline-none focus:ring-0 ring-0">
                  <Copy className="w-4 h-4" /> Exportar Excel
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto" ref={tableWrapperRef}>
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 hover:bg-gray-100">
                      <TableHead className="font-semibold text-gray-700 transition-colors cursor-pointer select-none hover:bg-gray-200" onClick={() => handleSort('data')}><div className="flex items-center gap-2">Data {getSortIcon('data')}</div></TableHead>
                      <TableHead className="font-semibold text-gray-700 transition-colors cursor-pointer select-none hover:bg-gray-200 whitespace-nowrap min-w-[210px]" onClick={() => handleSort('pep')}><div className="flex items-center gap-2">Serviço {getSortIcon('pep')}</div></TableHead>
                      <TableHead className="font-semibold text-gray-700 transition-colors cursor-pointer select-none hover:bg-gray-200" onClick={() => handleSort('valorProgramado')}><div className="flex items-center gap-2">Programado {getSortIcon('valorProgramado')}</div></TableHead>
                      <TableHead className="font-semibold text-gray-700 transition-colors cursor-pointer select-none hover:bg-gray-200" onClick={() => handleSort('valorConcluido')}><div className="flex items-center gap-2">Concluido {getSortIcon('valorConcluido')}</div></TableHead>
                      <TableHead className="font-semibold text-gray-700 transition-colors cursor-pointer select-none hover:bg-gray-200" onClick={() => handleSort('valorParcial')}><div className="flex items-center gap-2">Parcial {getSortIcon('valorParcial')}</div></TableHead>
                      <TableHead className="font-semibold text-gray-700 transition-colors cursor-pointer select-none hover:bg-gray-200" onClick={() => handleSort('valorCancelado')}><div className="flex items-center gap-2">Cancelado {getSortIcon('valorCancelado')}</div></TableHead>
                      <TableHead className="font-semibold text-gray-700 transition-colors cursor-pointer select-none hover:bg-gray-200" onClick={() => handleSort('statusProg')}><div className="flex items-center gap-2">Status {getSortIcon('statusProg')}</div></TableHead>
                      <TableHead className="w-14 font-semibold text-gray-700 transition-colors cursor-pointer select-none hover:bg-gray-200">Motivo</TableHead>
                      <TableHead className="font-semibold text-gray-700 transition-colors cursor-pointer select-none hover:bg-gray-200">#</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredData.matrix.map((row, index) => (
                      <TableRow data-row-index={index} key={index} className={cn("cursor-pointer transition-all duration-200 select-none", (Array.isArray(selectedMatrixRows) && selectedMatrixRows.includes(row.pep)) ? "bg-green-50 border-l-4 border-l-green-600 shadow-md hover:bg-green-100" : "hover:bg-gray-50")} onClick={(e: React.MouseEvent) => {
                        if (e.shiftKey && typeof lastSelectedIndex === 'number' && lastSelectedIndex !== null) {
                          e.preventDefault(); const start = Math.min(lastSelectedIndex, index); const end = Math.max(lastSelectedIndex, index); const range = filteredData.matrix.slice(start, end + 1).map(r => r.pep);
                          setSelectedMatrixRows(prev => { const preserved = Array.isArray(prev) ? prev.filter(p => { const idx = filteredData.matrix.findIndex(r => r.pep === p); return idx === -1 || idx < start || idx > end; }) : []; return Array.from(new Set([...preserved, ...range])); }); setLastSelectedIndex(index); scrollToRow(index); return;
                        }
                        if ((e.ctrlKey || e.metaKey)) { e.preventDefault(); setSelectedMatrixRows(prev => { if (Array.isArray(prev) && prev.includes(row.pep)) return prev.filter(p => p !== row.pep); return Array.isArray(prev) ? [...prev, row.pep] : [row.pep]; }); setLastSelectedIndex(index); scrollToRow(index);
                        } else { setSelectedMatrixRows([row.pep]); setLastSelectedIndex(index); scrollToRow(index); }
                      }} onContextMenu={(e: React.MouseEvent) => {
                        e.preventDefault(); const cx = e.clientX; const cy = e.clientY; setContextPos({ x: cx, y: cy }); setContextItems([
                          { id: 'copy-servicos', label: 'COPIAR SERVIÇOS', onClick: () => { const selected = (Array.isArray(selectedMatrixRows) && selectedMatrixRows.length) ? selectedMatrixRows : [row.pep]; const lines = filteredData.matrix.filter(r => selected.includes(r.pep)).map(r => r.pep); navigator.clipboard.writeText(lines.join('\n')).then(() => showToast('Serviços copiados!')).catch(() => showToast('Erro ao copiar')); setContextOpen(false); } },
                                                { id: 'copy-table', label: 'COPIAR TABELA', onClick: () => { const selected = (Array.isArray(selectedMatrixRows) && selectedMatrixRows.length) ? selectedMatrixRows : [row.pep]; const rowsToCopy = filteredData.matrix.filter(r => selected.includes(r.pep)); const tsv = rowsToCopy.map(r => [r.pep, r.data, r.statusProg, r.valorProgramado].join('\t')).join('\n'); navigator.clipboard.writeText(tsv).then(() => showToast('Tabela copiada!')).catch(() => showToast('Erro ao copiar')); setContextOpen(false); } }
                        ]); setContextOpen(true);
                      }} onAuxClick={(e: React.MouseEvent) => { if ((e as React.MouseEvent).button === 1) { e.preventDefault(); const raw = String(row.valorProgramado || '0'); navigator.clipboard.writeText(raw).then(() => { showToast(`Valor R$ ${row.valorProgramado.toLocaleString('pt-BR')} copiado!`); }).catch(() => showToast('Erro ao copiar valor')); } }} title="Ctrl/Cmd+clique para selecionar múltiplas linhas. Clique com o botão direito para abrir menu de copiar">
                        <TableCell className="font-mono text-sm truncate">{row.data}</TableCell>
                        <TableCell className="font-mono text-sm truncate min-w-[210px]">{row.pep}</TableCell>
                        <TableCell className="text-sm text-right truncate">{row.valorProgramado.toLocaleString('pt-BR')}</TableCell>
                        <TableCell className="text-sm text-right truncate">{row.valorConcluido.toLocaleString('pt-BR')}</TableCell>
                        <TableCell className="text-sm text-right truncate">{row.valorParcial.toLocaleString('pt-BR')}</TableCell>
                        <TableCell className="text-sm text-right truncate">{row.valorCancelado.toLocaleString('pt-BR')}</TableCell>
                        <TableCell className="truncate"><span className={`px-3 py-1 rounded-full text-xs font-medium ${row.statusProg === 'Concluído' ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-yellow-100 text-yellow-800 border border-yellow-300'}`}>{row.statusProg}</span></TableCell>
                        <TableCell className="w-14 text-sm truncate">{row.motivoNaoCumprimento}</TableCell>
                        <TableCell className="w-12 text-center">{getHashEmoji(row)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>

      <ContextMenu open={contextOpen} position={contextPos} items={contextItems} onClose={() => setContextOpen(false)} />
    </div>
  );
}
