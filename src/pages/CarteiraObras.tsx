// Dashboard consolidado: conteúdo migrado da antiga PrazosSAP1
import React, { useEffect, useState, useRef } from 'react';
import ContextMenu from '../components/ContextMenu';
import { useNavigate } from 'react-router-dom';
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Copy, RotateCcw, Menu, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';
import { ChartContainer } from "../components/ui/chart";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import html2canvas from 'html2canvas';
import * as XLSX from 'xlsx';
import { DateRangeFilter } from '../components/DateRangeFilter';
import { PEPSearch } from '../components/PEPSearch';
import { cn } from "../lib/utils";
import type { MatrizItem } from '../services/api';
import { getCarteiraObras } from '../services/api';
import { showToast } from '../components/toast';
import LogoSetup from '../assets/LogoSetup1.png';
import { FundoAnimado } from '../components/FundoAnimado';

interface DashboardData {
	statusENER: { name: string; value: number; qtd: number }[]; // Valor (R$) e quantidade
	statusCONC: { name: string; value: number; qtd: number }[];
	comparison: { name: string; value: number; qtd: number }[];
	reasons: { name: string; value: number; qtd: number }[];
	// Nova ordem/nomes da matriz conforme solicitado pelo usuário:
	// (PEP, Data limite, SECCIONAL, Municipio, data prog/conc, TIPO, STATUS SAP, R$)
	matrix: { pep: string; dataLimite: string; seccional: string; municipio: string; dataProgConc: string; tipo: string; status: string; rs: number }[];
}

// Tipo mínimo para o renderer de rótulos das barras
type BarLabelProps = {
	x?: number | string;
	y?: number | string;
	width?: number | string;
	height?: number | string;
	value?: number | string;
	index?: number;
};

// Tipos mínimos para renderizadores e callbacks do recharts (evitar `any`)
type ChartTickProps = { x?: number; y?: number; payload?: { value?: string } };
// (intencionalmente removido tipo BarDatumLike não utilizado)

// Tick horizontal com quebra em até 2 linhas
const TwoLineTick: React.FC<ChartTickProps> = ({ x = 0, y = 0, payload }) => {
  const raw = String(payload?.value ?? '');
  const maxChars = 12;
  const normalizeSpace = (s: string) => s.replace(/\s+/g, ' ').trim();
  let line1 = raw;
  let line2 = '';
  if (raw.length > maxChars) {
    const words = normalizeSpace(raw).split(' ');
    let cur = '';
    const rest: string[] = [];
    for (const w of words) {
      if ((cur + (cur ? ' ' : '') + w).length <= maxChars) {
        cur = cur ? cur + ' ' + w : w;
      } else {
        rest.push(w);
      }
    }
    if (!cur) {
      const half = Math.ceil(raw.length / 2);
      line1 = raw.slice(0, half);
      line2 = raw.slice(half);
    } else {
      line1 = cur;
      line2 = rest.join(' ');
    }
  }
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={14} textAnchor="middle" fontSize={12} fill="currentColor">
        <tspan x={0} dy={0}>{line1}</tspan>
        {line2 ? <tspan x={0} dy={14}>{line2}</tspan> : null}
      </text>
    </g>
  );
};

export default function CarteiraObras() {
	const navigate = useNavigate();
	const [selectedRegion, setSelectedRegion] = useState<string>('all');
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const [pepSearch, setPepSearch] = useState('');
	const [selectedStartDate, setSelectedStartDate] = useState<Date | undefined>(undefined);
	const [selectedEndDate, setSelectedEndDate] = useState<Date | undefined>(undefined);
	const [selectedStatusSap, setSelectedStatusSap] = useState<string>('');
	const [selectedTipo, setSelectedTipo] = useState<string>('');
	const [selectedGrouping, setSelectedGrouping] = useState<string>('');
	const [selectedMatrixRows, setSelectedMatrixRows] = useState<string[]>([]);
	const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
	// Context menu state
	const [contextOpen, setContextOpen] = useState(false);
	const [contextPos, setContextPos] = useState({ x: 0, y: 0 });
	const [contextItems, setContextItems] = useState<{ id: string; label: string; onClick: () => void }[]>([]);
	const [runtimeError, setRuntimeError] = useState<string | null>(null);

	// garante que os estados do menu de contexto sejam lidos pelo TS (evita TS6133)
	useEffect(() => {
		// leitura intencional para suprimir 'declared but never read' quando o compilador
		// não detecta uso em JSX em alguns casos.
		void contextOpen;
		void contextPos;
		void contextItems;
	}, [contextOpen, contextPos, contextItems]);

	const [sortConfig, setSortConfig] = useState<{ key?: keyof DashboardData['matrix'][0]; direction?: 'asc' | 'desc' }>({});
	const [regions, setRegions] = useState<string[]>([]);
	const [rawRows, setRawRows] = useState<MatrizItem[]>([]);
	const [statusEnerMap] = useState<Record<string, Record<string, number>>>({});
	const [statusConcMap] = useState<Record<string, Record<string, number>>>({});
	const [reasonsMap] = useState<Record<string, Record<string, number>>>({});
	const [statusSapList, setStatusSapList] = useState<string[]>([]);
	const [tiposList, setTiposList] = useState<string[]>([]);
	const [agrupamentosList, setAgrupamentosList] = useState<string[]>([]);

	// Título da janela quando nesta página
	useEffect(() => {
		const prevTitle = document.title;
		document.title = 'Carteira de Obras';
		return () => {
			document.title = prevTitle;
		};
	}, []);

	// (runtimeError overlay rendered inline later)

	// Global error handlers to surface runtime exceptions as toasts (ajuda debug em produção)
	useEffect(() => {
		if (typeof window === 'undefined') return;
		const onError = (ev: ErrorEvent) => {
			try {
				const msg = String(ev.message || ev.error || 'Erro desconhecido')
				console.error('Global error captured in CarteiraObras', ev.error || ev.message, ev);
				setRuntimeError(msg)
				showToast(`Erro na página Carteira de Obras: ${msg}`);
			} catch (e) { console.debug('failed to report global error', e) }
		};
		const onRejection = (ev: PromiseRejectionEvent) => {
			try {
				const reason = ev.reason
				const msg = reason && reason.message ? String(reason.message) : String(reason || 'Rejeição não tratada')
				console.error('Unhandled rejection in CarteiraObras', ev.reason);
				setRuntimeError(msg)
				showToast(`Erro não tratado: ${msg}`);
			} catch (e) { console.debug('failed to report rejection', e) }
		};
		window.addEventListener('error', onError as EventListener);
		window.addEventListener('unhandledrejection', onRejection as EventListener);
		return () => {
			window.removeEventListener('error', onError as EventListener);
			window.removeEventListener('unhandledrejection', onRejection as EventListener);
		};
	}, []);


	// Estados para filtros interativos
	const [activeFilters, setActiveFilters] = useState<Record<string, string>>({});

	const clearFilters = () => {
		setSelectedRegion('all');
		setActiveFilters({});
		setSelectedStartDate(undefined);
		setSelectedEndDate(undefined);
		setPepSearch('');
		setSelectedStatusSap('');
		setSelectedTipo('');
		setSelectedGrouping('');
		showToast('Filtros limpos!');
	};

	const clearPepSearch = () => {
		setPepSearch('');
		showToast('Pesquisa PEP limpa!');
	};

	// Ordenação
	const handleSort = (key: keyof DashboardData['matrix'][0]) => {
		let direction: 'asc' | 'desc' = 'asc';
		if (sortConfig.key === key && sortConfig.direction === 'asc') {
			direction = 'desc';
		}
		setSortConfig({ key, direction });
	};

	const getSortIcon = (columnKey: keyof DashboardData['matrix'][0]) => {
		if (sortConfig.key !== columnKey) {
			return <ChevronsUpDown className="w-4 h-4 text-gray-500" />;
		}
		return sortConfig.direction === 'asc'
			? <ChevronUp className="w-4 h-4 text-green-600" />
			: <ChevronDown className="w-4 h-4 text-green-600" />;
	};

	// Filtros interativos
	const handleChartClick = (
		chartType: 'statusEmAndamento' | 'statusConcluida' | 'statusParada' | 'seccionalSelected',
		label: string
	) => {
		const newFilters = { ...activeFilters };
		// Se for um filtro de STATUS FIM, garantir que apenas um esteja ativo por vez
		if (chartType === 'statusEmAndamento' || chartType === 'statusConcluida' || chartType === 'statusParada') {
			// remove os outros dois status fim para tornar a seleção exclusiva
			delete newFilters.statusEmAndamento;
			delete newFilters.statusConcluida;
			delete newFilters.statusParada;
			// toggle: se já estava selecionado, removemos; caso contrário aplicamos
			if ((activeFilters as Record<string,string>)[chartType] === label) {
				// já estava selecionado -> removemos
				console.log(`[TOAST] Filtro removido: ${label}`);
			} else {
				newFilters[chartType] = label;
				console.log(`[TOAST] Filtro aplicado: ${label}`);
			}
		} else {
			if (newFilters[chartType] === label) {
				delete newFilters[chartType];
				console.log(`[TOAST] Filtro removido: ${label}`);
				if (chartType === 'seccionalSelected') setSelectedRegion('all');
			} else {
				newFilters[chartType] = label;
				console.log(`[TOAST] Filtro aplicado: ${label}`);
				if (chartType === 'seccionalSelected') setSelectedRegion(label);
			}
		}
		setActiveFilters(newFilters);
	};

	// Refs dos gráficos
	const statusENERRef = useRef<HTMLDivElement>(null);
	const comparisonRef = useRef<HTMLDivElement>(null);
	const statusCONCRef = useRef<HTMLDivElement>(null);
	const reasonsRef = useRef<HTMLDivElement>(null);
	// Ref para o wrapper da tabela (usado para rolamento automático)
	const tableWrapperRef = useRef<HTMLDivElement | null>(null);

	// Helper para rolar a linha visível ao navegar por teclado/seleção
	const scrollToRow = (idx: number) => {
		try {
			const container = tableWrapperRef.current;
			let el: HTMLElement | null = null;
			if (container) {
				el = container.querySelector(`[data-row-index="${idx}"]`);
			}
			if (!el) {
				el = document.querySelector(`[data-row-index="${idx}"]`);
			}
			if (el) {
				el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
			}
		} catch (err) {
			// falhar silenciosamente se algo der errado
			console.debug('scrollToRow error', err);
		}
	};

	// Renderizador de rótulos: quando a barra estiver ativa, usa preto e negrito
	const makeLabelRenderer = (
		dataArr: { name: string; qtd: number }[],
		isActive: (name: string) => boolean,
	) => (props: BarLabelProps) => {
		const { x = 0, y = 0, width = 0, value, index = 0 } = props || {} as BarLabelProps;
		const item = dataArr?.[index];
		const active = item ? isActive(item.name) : false;
		const cx = Number(x) + Number(width) / 2;
		const cy = Number(y) - 6;
		return (
			<text
				x={cx}
				y={cy}
				textAnchor="middle"
				fill={active ? '#111827' : 'hsl(var(--foreground))'}
				fontWeight={active ? 700 : 400}
				fontSize={12}
			>
				{value}
			</text>
		);
	};

	// Formatação de valores curtos com 2 casas decimais e sufixos Mi/Mil
	const numberFmt2 = React.useMemo(() => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), []);
	const numberFmt1 = React.useMemo(() => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), []);
	const formatValorShort = (n: number) => {
		const abs = Math.abs(n);
		if (abs >= 1_000_000) return `${numberFmt2.format(n / 1_000_000)} MI`;
		if (abs >= 1_000) return `${numberFmt1.format(n / 1_000)} Mil`;
		return `R$ ${numberFmt2.format(n)}`;
	};

	// Formatação por extenso para o indicador (Mil / Milhões)
	const formatMilExtenso = React.useCallback((n: number) => {
		const abs = Math.abs(n);
		if (abs >= 1_000_000) return `${numberFmt2.format(n / 1_000_000)} Milhões`;
		if (abs >= 1_000) return `${numberFmt2.format(n / 1_000)} Mil`;
		return `R$ ${numberFmt2.format(n)}`;
	}, [numberFmt2]);

  // (removido empilhamento/escala dos gráficos de Concluídas/Paradas)

	// Parsing de moeda robusto (aceita formatos BR e US; remove ruídos)
	const parseMoneyToNumber = React.useCallback((input: unknown): number => {
		if (typeof input === 'number' && Number.isFinite(input)) return input;
		const raw = String(input ?? '').trim();
		if (!raw) return 0;
		// remove símbolo e caracteres não numéricos relevantes (mantém dígitos, vírgula, ponto e sinal)
		let s = raw.replace(/R\$|\s|\u00A0/gi, '').replace(/[^0-9,.-]/g, '');
		const hasComma = s.includes(',');
		const hasDot = s.includes('.');
		if (hasComma && hasDot) {
			// Decide separador decimal pelo último símbolo
			const lastComma = s.lastIndexOf(',');
			const lastDot = s.lastIndexOf('.');
			if (lastComma > lastDot) {
				// Formato BR: 1.234.567,89 => remove pontos e troca vírgula por ponto
				s = s.replace(/\./g, '').replace(/,/g, '.');
			} else {
				// Formato US: 1,234,567.89 => remove vírgulas
				s = s.replace(/,/g, '');
			}
		} else if (hasComma && !hasDot) {
			// Provável BR: 123,45
			s = s.replace(/,/g, '.');
		} else {
			// US ou inteiro simples: 1234.56 ou 1234
			// remove separadores de milhares se houver (vírgula)
			s = s.replace(/,(?=\d{3}(\D|$))/g, '');
		}
		const n = Number.parseFloat(s);
		return Number.isFinite(n) ? n : 0;
	}, []);
// (sem toCents por enquanto; evitamos funções não utilizadas)

	// Renderizador para rótulos de Valor (barra azul) no comparativo
	const makeValueLabelRenderer = (
		dataArr: { name: string; value: number }[],
		isActive: (name: string) => boolean,
	) => (props: BarLabelProps) => {
		const { x = 0, y = 0, width = 0, value, index = 0 } = props || {} as BarLabelProps;
		const item = dataArr?.[index];
		const active = item ? isActive(item.name) : false;
		const cx = Number(x) + Number(width) / 2;
		const cy = Number(y) - 6;
		// Mostrar SEMPRE o valor original (não escalado) vindo de dataArr,
		// mesmo que a altura da barra use dados escalados.
		const v = Number(item?.value ?? value ?? 0) || 0;
		return (
			<text
				x={cx}
				y={cy}
				textAnchor="middle"
				fill={active ? '#111827' : 'hsl(var(--foreground))'}
				fontWeight={active ? 700 : 400}
				fontSize={12}
			>
				{formatValorShort(v)}
			</text>
		);
	};

	// Dados calculados

	// Helpers seguros para leitura de campos dinâmicos vindos da planilha (evita uso direto de `any`)
	const getFieldString = React.useCallback((obj: Record<string, unknown> | MatrizItem, key: string) => {
		if (obj == null) return ''
		if (!Object.prototype.hasOwnProperty.call(obj, key)) return ''
		const v = (obj as Record<string, unknown>)[key]
		if (v == null) return ''
		return String(v).trim()
	}, [])
	const getFieldNumber = React.useCallback((obj: Record<string, unknown> | MatrizItem, key: string) => {
		if (obj == null) return 0;
		if (!Object.prototype.hasOwnProperty.call(obj, key)) return 0;
		const v = (obj as Record<string, unknown>)[key];
		return parseMoneyToNumber(v);
	}, [parseMoneyToNumber])
	const normalize = React.useCallback((s?: string) => String(s || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().toLowerCase(), [])

	// (normalização inline no efeito de carregamento para evitar dependências reativas desnecessárias)
	const groupByStatusFim = React.useCallback((rows: Array<Record<string, unknown> | MatrizItem>, agrupado: string) => {
		const norm = (s: string) => normalize(s)
		const stemMatch = (a: string, b: string) => {
			// igual, singular/plural equivalentes, ou mesma raiz ('concluid', 'parad', 'andamento')
			if (a === b) return true
			if (a.endsWith('s') && a.slice(0, -1) === b) return true
			if (b.endsWith('s') && b.slice(0, -1) === a) return true
			const stems = ['concluid', 'parad', 'andamento']
			return stems.some(st => a.includes(st) && b.includes(st))
		}
		const target = norm(agrupado)
		const map = new Map<string, { value: number; pepSet: Set<string> }>()
		for (const r of rows) {
			const statusAgr = norm(getFieldString(r, 'statusAgrupado'))
			if (!stemMatch(statusAgr, target)) continue
			const key = getFieldString(r, 'statusFim') || '—'
			const pep = getFieldString(r, 'pep') || `pep-${Math.random().toString(36).slice(2,8)}`
			const cur = map.get(key) || { value: 0, pepSet: new Set<string>() }
			const v = getFieldNumber(r, 'valor')
			cur.value = (cur.value || 0) + (Number.isFinite(v) ? v : 0)
			cur.pepSet.add(pep)
			map.set(key, cur)
		}
		const out = Array.from(map.entries()).map(([name, obj]) => ({ name, qtd: obj.pepSet.size, value: Math.round(obj.value || 0) }))
		return out.sort((a,b) => b.qtd - a.qtd)
	}, [normalize, getFieldString, getFieldNumber])
	const filteredData = React.useMemo(() => {
		try {
			// original logic below
		// Sinais de suporte de campos na matriz
		const anyHasEner = rawRows.some(r => (r.statusEner || '').trim());
		const anyHasConc = rawRows.some(r => (r.statusConc || '').trim());
		const anyHasMotivos = rawRows.some(r => (r.statusServico || '').trim());

	// 1) Base de linhas para OUTROS gráficos e TABELA: respeita comparação e região
		const regionFilterForOthers = (activeFilters.seccionalSelected || (selectedRegion !== 'all' ? selectedRegion : undefined)) as string | undefined;
		let rowsForOthers = rawRows;
				if (regionFilterForOthers) rowsForOthers = rowsForOthers.filter(r => (r.seccional || '').trim() === regionFilterForOthers);

				// Aplicar filtros por clique nas barras (status fim dentro de cada agrupamento)
				const nrm = (s: string) => normalize(s)
				const matchGroup = (s: string, groupStem: string) => nrm(s).includes(groupStem)
				if (activeFilters.statusEmAndamento) {
					rowsForOthers = rowsForOthers.filter(r => matchGroup(getFieldString(r,'statusAgrupado'),'andamento') && getFieldString(r,'statusFim') === activeFilters.statusEmAndamento)
				}
				if (activeFilters.statusConcluida) {
					rowsForOthers = rowsForOthers.filter(r => matchGroup(getFieldString(r,'statusAgrupado'),'concluid') && getFieldString(r,'statusFim') === activeFilters.statusConcluida)
				}
				if (activeFilters.statusParada) {
					rowsForOthers = rowsForOthers.filter(r => matchGroup(getFieldString(r,'statusAgrupado'),'parad') && getFieldString(r,'statusFim') === activeFilters.statusParada)
				}

				// Filtragem por status ENER / CONC / Motivos.
				// Se a matriz (rawRows) possui os campos auxiliares, filtramos diretamente por eles.
				// Caso contrário, usamos os mapas agregados (statusEnerMap/statusConcMap/reasonsMap)
				// para derivar as seccionais válidas para o rótulo selecionado.
				if (activeFilters.statusENER) {
					if (anyHasEner) {
						rowsForOthers = rowsForOthers.filter(r => (r.statusEner || '').trim() === activeFilters.statusENER);
					} else if (statusEnerMap && statusEnerMap[activeFilters.statusENER]) {
						const allowed = new Set(Object.keys(statusEnerMap[activeFilters.statusENER] || {}));
						rowsForOthers = rowsForOthers.filter(r => allowed.has((r.seccional || '').trim()));
					}
				}

				if (activeFilters.statusCONC) {
					if (anyHasConc) {
						rowsForOthers = rowsForOthers.filter(r => (r.statusConc || '').trim() === activeFilters.statusCONC);
					} else if (statusConcMap && statusConcMap[activeFilters.statusCONC]) {
						const allowed = new Set(Object.keys(statusConcMap[activeFilters.statusCONC] || {}));
						rowsForOthers = rowsForOthers.filter(r => allowed.has((r.seccional || '').trim()));
					}
				}

				if (activeFilters.reasons) {
					if (anyHasMotivos) {
						rowsForOthers = rowsForOthers.filter(r => (r.statusServico || '').trim() === activeFilters.reasons);
					} else if (reasonsMap && reasonsMap[activeFilters.reasons]) {
						const allowed = new Set(Object.keys(reasonsMap[activeFilters.reasons] || {}));
						rowsForOthers = rowsForOthers.filter(r => allowed.has((r.seccional || '').trim()));
					}
				}
		if (pepSearch.trim()) rowsForOthers = rowsForOthers.filter(r => (r.pep || '').toLowerCase().includes(pepSearch.toLowerCase()));

				// Aplicar filtros de Status SAP, Tipo, Mês e Faixa de Datas
				if (selectedStatusSap) rowsForOthers = rowsForOthers.filter(r => (r.statusSap || '').trim() === selectedStatusSap);
				if (selectedTipo) rowsForOthers = rowsForOthers.filter(r => (r.tipo || '').trim() === selectedTipo);
				// Filtrar por agrupamento (campo statusAgrupado) se selecionado
				if (selectedGrouping) {
					rowsForOthers = rowsForOthers.filter(r => {
						const a = String(r.statusAgrupado || '').trim();
						return a === selectedGrouping;
					});
				}
				if (selectedStartDate || selectedEndDate) {
					const toDate = (s: string): number => {
						const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
						if (m) {
							const d = Number(m[1]);
							const mo = Number(m[2]) - 1;
							const y = Number(m[3]);
							return new Date(y, mo, d).getTime();
						}
						const t = Date.parse(s);
						return Number.isNaN(t) ? Number.NaN : t;
					};
					const startTs = selectedStartDate ? new Date(selectedStartDate.getFullYear(), selectedStartDate.getMonth(), selectedStartDate.getDate()).getTime() : Number.NaN;
					const endTs = selectedEndDate ? new Date(selectedEndDate.getFullYear(), selectedEndDate.getMonth(), selectedEndDate.getDate()).getTime() : Number.NaN;
					rowsForOthers = rowsForOthers.filter(r => {
						const dates: number[] = [];
						const dl = String(r.prazo || '').trim();
						const dp = String(r.dataConclusao || '').trim();
						if (dl) dates.push(toDate(dl));
						if (dp) dates.push(toDate(dp));
						if (!dates.length) return false; // sem data, fora do intervalo
						return dates.some(ts => {
							const okStart = Number.isNaN(startTs) || ts >= startTs;
							const okEnd = Number.isNaN(endTs) || ts <= endTs;
							return okStart && okEnd;
						});
					});
				}

		// 2) Base de linhas para COMPARATIVO: NÃO aplicar filtro de comparação nem selectedRegion, apenas demais filtros
				let rowsForComparison = rawRows;
		if (activeFilters.statusENER && anyHasEner) rowsForComparison = rowsForComparison.filter(r => (r.statusEner || '').trim() === activeFilters.statusENER);
		if (activeFilters.statusCONC && anyHasConc) rowsForComparison = rowsForComparison.filter(r => (r.statusConc || '').trim() === activeFilters.statusCONC);
		if (activeFilters.reasons && anyHasMotivos) rowsForComparison = rowsForComparison.filter(r => (r.statusServico || '').trim() === activeFilters.reasons);
				// aplicar também os filtros por clique (status fim por agrupamento)
				if (activeFilters.statusEmAndamento) rowsForComparison = rowsForComparison.filter(r => nrm(getFieldString(r,'statusAgrupado')).includes('andamento') && getFieldString(r,'statusFim') === activeFilters.statusEmAndamento)
				if (activeFilters.statusConcluida) rowsForComparison = rowsForComparison.filter(r => nrm(getFieldString(r,'statusAgrupado')).includes('concluid') && getFieldString(r,'statusFim') === activeFilters.statusConcluida)
				if (activeFilters.statusParada) rowsForComparison = rowsForComparison.filter(r => nrm(getFieldString(r,'statusAgrupado')).includes('parad') && getFieldString(r,'statusFim') === activeFilters.statusParada)

				// Aplicar também os filtros globais aos dados de comparação (exceto região/comparativo)
				if (selectedStatusSap) rowsForComparison = rowsForComparison.filter(r => (r.statusSap || '').trim() === selectedStatusSap);
				if (selectedTipo) rowsForComparison = rowsForComparison.filter(r => (r.tipo || '').trim() === selectedTipo);
				if (selectedGrouping) {
					rowsForComparison = rowsForComparison.filter(r => {
						const a = String(r.statusAgrupado || '').trim();
						return a === selectedGrouping;
					});
				}
				if (selectedStartDate || selectedEndDate) {
					const toDate = (s: string): number => {
						const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
						if (m) {
							const d = Number(m[1]);
							const mo = Number(m[2]) - 1;
							const y = Number(m[3]);
							return new Date(y, mo, d).getTime();
						}
						const t = Date.parse(s);
						return Number.isNaN(t) ? Number.NaN : t;
					};
					const startTs = selectedStartDate ? new Date(selectedStartDate.getFullYear(), selectedStartDate.getMonth(), selectedStartDate.getDate()).getTime() : Number.NaN;
					const endTs = selectedEndDate ? new Date(selectedEndDate.getFullYear(), selectedEndDate.getMonth(), selectedEndDate.getDate()).getTime() : Number.NaN;
					rowsForComparison = rowsForComparison.filter(r => {
						const dates: number[] = [];
						const dl = String(r.prazo || '').trim();
						const dp = String(r.dataConclusao || '').trim();
						if (dl) dates.push(toDate(dl));
						if (dp) dates.push(toDate(dp));
						if (!dates.length) return false;
						return dates.some(ts => {
							const okStart = Number.isNaN(startTs) || ts >= startTs;
							const okEnd = Number.isNaN(endTs) || ts <= endTs;
							return okStart && okEnd;
						});
					});
				}

		// 2) Agregações serão feitas inline abaixo

	// Se a matriz não tiver os campos (produção antiga), usar fallback dos mapas por contagem
	const hasEner = anyHasEner;
	const hasConc = anyHasConc;
	const hasMotivos = anyHasMotivos;

		const sumFromMap = (map: Record<string, Record<string, number>>) => {
			const arr: { name: string; value: number; qtd: number }[] = [];
			const regionFilter = (activeFilters.comparison || (selectedRegion !== 'all' ? selectedRegion : undefined)) as string | undefined;
			Object.entries(map).forEach(([status, byRegion]) => {
				let count = 0;
				if (regionFilter) {
					count = byRegion[regionFilter] || 0;
				} else {
					count = Object.values(byRegion).reduce((s, n) => s + (n || 0), 0);
				}
				arr.push({ name: status, value: count, qtd: count });
			});
			return arr.sort((a, b) => b.qtd - a.qtd);
		};

		const statusENER = hasEner ? (function() { const m = new Map<string, { valor: number; qtd: number }>(); for (const r of rowsForOthers) { const k = (r.statusEner || '').trim(); if (!k) continue; const v = getFieldNumber(r, 'valor'); const cur = m.get(k) || { valor: 0, qtd: 0 }; m.set(k, { valor: cur.valor + v, qtd: cur.qtd + 1 }); } return Array.from(m.entries()).map(([name, obj]) => ({ name, value: obj.valor, qtd: obj.qtd })).sort((a, b) => b.qtd - a.qtd); })() : sumFromMap(statusEnerMap);
		const statusCONC = hasConc ? (function() { const m = new Map<string, { valor: number; qtd: number }>(); for (const r of rowsForOthers) { const k = (r.statusConc || '').trim(); if (!k) continue; const v = getFieldNumber(r, 'valor'); const cur = m.get(k) || { valor: 0, qtd: 0 }; m.set(k, { valor: cur.valor + v, qtd: cur.qtd + 1 }); } return Array.from(m.entries()).map(([name, obj]) => ({ name, value: obj.valor, qtd: obj.qtd })).sort((a, b) => b.qtd - a.qtd); })() : sumFromMap(statusConcMap);
		const reasons = hasMotivos ? (function() { const m = new Map<string, { valor: number; qtd: number }>(); for (const r of rowsForOthers) { const k = (r.statusServico || '').trim(); if (!k) continue; const v = getFieldNumber(r, 'valor'); const cur = m.get(k) || { valor: 0, qtd: 0 }; m.set(k, { valor: cur.valor + v, qtd: cur.qtd + 1 }); } return Array.from(m.entries()).map(([name, obj]) => ({ name, value: obj.valor, qtd: obj.qtd })).sort((a, b) => b.qtd - a.qtd); })() : sumFromMap(reasonsMap);
		const comparison = (function() { const m = new Map<string, { valor: number; qtd: number }>(); for (const r of rowsForComparison) { const s = (r.seccional || '').trim(); if (!s) continue; const v = getFieldNumber(r, 'valor'); const cur = m.get(s) || { valor: 0, qtd: 0 }; m.set(s, { valor: cur.valor + v, qtd: cur.qtd + 1 }); } return Array.from(m.entries()).map(([name, obj]) => ({ name, value: obj.valor, qtd: obj.qtd })).sort((a, b) => b.qtd - a.qtd); })();

		// 3) Linhas da matriz (após filtros), com sort
		let tableRows: DashboardData['matrix'] = rowsForOthers.map(r => {
			const valorNum = getFieldNumber(r, 'valor');
			return {
				pep: String(r.pep || ''),
				dataLimite: String(r.prazo || ''),
				seccional: String(r.seccional || ''),
				municipio: getFieldString(r, 'municipio') || '',
				dataProgConc: getFieldString(r, 'dataConclusao') || '',
				tipo: String(r.tipo || ''),
				status: String(r.statusSap || ''),
				rs: valorNum,
			};
		});

			if (sortConfig.key) {
			// Helpers para ordenar datas em formato dd/mm/aaaa (ou outros parseáveis)
			const parseDate = (s: string): number => {
				if (!s) return Number.NaN;
				const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
				if (m) {
					const d = Number(m[1]);
					const mo = Number(m[2]) - 1;
					const y = Number(m[3]);
					const dt = new Date(y, mo, d);
					return dt.getTime();
				}
				const t = Date.parse(s);
				return Number.isNaN(t) ? Number.NaN : t;
			};

			const compareNumbers = (x: number, y: number) => {
				if (Number.isNaN(x) && Number.isNaN(y)) return 0;
				if (Number.isNaN(x)) return 1; // valores vazios ao final
				if (Number.isNaN(y)) return -1;
				return x - y;
			};

			tableRows = [...tableRows].sort((a, b) => {
				const key = sortConfig.key!;
				const dir = sortConfig.direction === 'asc' ? 1 : -1;
				const aValue = a[key];
				const bValue = b[key];

				if (key === 'rs') {
					return dir * ((aValue as number) - (bValue as number));
				}

				if (key === 'dataLimite' || key === 'dataProgConc') {
					const da = parseDate(String(aValue));
					const db = parseDate(String(bValue));
					return dir * compareNumbers(da, db);
				}

				const aStr = String(aValue).toLowerCase();
				const bStr = String(bValue).toLowerCase();
				if (aStr < bStr) return -1 * dir;
				if (aStr > bStr) return 1 * dir;
				return 0;
			});
		}

			return {
				statusENER,
				statusCONC,
				comparison,
				reasons,
				matrix: tableRows,
			} as DashboardData;
		} catch (err) {
			console.error('Erro ao calcular filteredData', err)
			try { setRuntimeError(String(err || 'Erro desconhecido ao processar dados')) } catch (e) { console.debug('failed to set runtimeError', e) }
			return { statusENER: [], statusCONC: [], comparison: [], reasons: [], matrix: [] } as DashboardData
		}
	}, [rawRows, selectedRegion, activeFilters, pepSearch, sortConfig, statusEnerMap, statusConcMap, reasonsMap, selectedStatusSap, selectedTipo, selectedGrouping, selectedStartDate, selectedEndDate, getFieldNumber, getFieldString, normalize]);

	// (helpers moved above)

	// Filtrar linhas por Seccional selecionada (via sidebar ou clique no gráfico de Seccionais)
	// Agora também aplica filtro de data (selectedStartDate / selectedEndDate) para que os gráficos respeitem o range
	const rowsForCharts = React.useMemo(() => {
		const regionFilter = (activeFilters.seccionalSelected || (selectedRegion !== 'all' ? selectedRegion : undefined)) as string | undefined;
		let rows = rawRows;
		if (regionFilter) rows = rows.filter(r => (r.seccional || '').trim() === regionFilter);

		// aplicar filtro de data: considera 'prazo' e 'dataConclusao'
		if (selectedStartDate || selectedEndDate) {
			const toDate = (s: string): number => {
				const m = s.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
				if (m) {
					const d = Number(m[1]);
					const mo = Number(m[2]) - 1;
					const y = Number(m[3]);
					return new Date(y, mo, d).getTime();
				}
				const t = Date.parse(s);
				return Number.isNaN(t) ? Number.NaN : t;
			};
			const startTs = selectedStartDate ? new Date(selectedStartDate.getFullYear(), selectedStartDate.getMonth(), selectedStartDate.getDate()).getTime() : Number.NaN;
			const endTs = selectedEndDate ? new Date(selectedEndDate.getFullYear(), selectedEndDate.getMonth(), selectedEndDate.getDate()).getTime() : Number.NaN;
			rows = rows.filter(r => {
				const dates: number[] = [];
				const dl = String(r.prazo || '').trim();
				const dp = String(r.dataConclusao || '').trim();
				if (dl) dates.push(toDate(dl));
				if (dp) dates.push(toDate(dp));
				if (!dates.length) return false;
				return dates.some(ts => {
					const okStart = Number.isNaN(startTs) || ts >= startTs;
					const okEnd = Number.isNaN(endTs) || ts <= endTs;
					return okStart && okEnd;
				});
			});
		}

		return rows;
	}, [rawRows, activeFilters.seccionalSelected, selectedRegion, selectedStartDate, selectedEndDate]);

	const emAndamentoData = React.useMemo(() => groupByStatusFim(rowsForCharts, 'Em Andamento'), [rowsForCharts, groupByStatusFim]);
	// Dados memorizados por gráfico
	const emAndamentoQty = React.useMemo(() => emAndamentoData.map(d => ({ name: d.name, qtd: d.qtd })), [emAndamentoData])
	const emAndamentoValue = React.useMemo(() => emAndamentoData.map(d => ({ name: d.name, value: d.value })), [emAndamentoData])
	const concluidasData = React.useMemo(() => groupByStatusFim(rowsForCharts, 'Concluída'), [rowsForCharts, groupByStatusFim])
	const paradasData = React.useMemo(() => groupByStatusFim(rowsForCharts, 'Parada'), [rowsForCharts, groupByStatusFim])

	// Indicadores para as categorias de referência: "Comissionado" (Concluídas) e "Cancelada" (Paradas)
	const concluidasIndic = React.useMemo(() => {
		const nrm = (s: string) => normalize(s)
		return concluidasData.find(d => {
			const nm = nrm(d.name)
			return nm.includes('comission') || nm.includes('comiss')
		})
	}, [concluidasData, normalize])
	const paradasIndic = React.useMemo(() => {
		const nrm = (s: string) => normalize(s)
		return paradasData.find(d => {
			const nm = nrm(d.name)
			return nm.includes('cancelad')
		})
	}, [paradasData, normalize])

	// Remover do gráfico as categorias destacadas nos indicadores
	const concluidasChartData = React.useMemo(() => {
		const nrm = (s: string) => normalize(s)
		return concluidasData.filter(d => {
			const nm = nrm(d.name)
			// ocultar comissionado
			return !(nm.includes('comission') || nm.includes('comiss'))
		})
	}, [concluidasData, normalize])
	const concluidasChartQty = React.useMemo(() => concluidasChartData.map(d => ({ name: d.name, qtd: d.qtd })), [concluidasChartData])
	const concluidasChartValue = React.useMemo(() => concluidasChartData.map(d => ({ name: d.name, value: d.value })), [concluidasChartData])

	const paradasChartData = React.useMemo(() => {
		const nrm = (s: string) => normalize(s)
		return paradasData.filter(d => {
			const nm = nrm(d.name)
			// ocultar cancelada
			return !nm.includes('cancelad')
		})
	}, [paradasData, normalize])
	const paradasChartQty = React.useMemo(() => paradasChartData.map(d => ({ name: d.name, qtd: d.qtd })), [paradasChartData])
	const paradasChartValue = React.useMemo(() => paradasChartData.map(d => ({ name: d.name, value: d.value })), [paradasChartData])
	// Dados para Seccionais (dual-axis: PEP / Valor)
	const seccionaisQty = React.useMemo(() => filteredData.comparison.map(d => ({ name: d.name, qtd: d.qtd })), [filteredData.comparison])
	const seccionaisValue = React.useMemo(() => filteredData.comparison.map(d => ({ name: d.name, value: d.value })), [filteredData.comparison])

	// Handler de teclado: navegação por setas e seleções estendidas
	useEffect(() => {
		const handler = (ev: KeyboardEvent) => {
			// não interferir quando um input/textarea ou elemento editável estiver focado
			const active = document.activeElement as HTMLElement | null;
			if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) return;

			const rows = (filteredData && Array.isArray(filteredData.matrix)) ? filteredData.matrix : [];
			if (!rows.length) return;

			// Ctrl/Cmd + Shift + ArrowDown => selecionar até o fim (comportamento já existente)
			if ((ev.ctrlKey || ev.metaKey) && ev.shiftKey && ev.key === 'ArrowDown') {
				ev.preventDefault();
				const start = (typeof lastSelectedIndex === 'number' && lastSelectedIndex >= 0) ? lastSelectedIndex : 0;
				const toSelect = rows.slice(start).map(r => r.pep);
				// preserva seleção anterior antes do start quando existir
				setSelectedMatrixRows(prev => {
					const prefix = Array.isArray(prev) ? prev.filter(p => {
						const idx = rows.findIndex(r => r.pep === p);
						return idx >= 0 && idx < start;
					}) : [];
					return Array.from(new Set([...prefix, ...toSelect]));
				});
				setLastSelectedIndex(rows.length - 1);
				scrollToRow(rows.length - 1);
				return;
			}

			// ArrowDown / ArrowUp navegação simples
			if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
				ev.preventDefault();
				// determina índice atual: preferir lastSelectedIndex, caso contrário usar primeiro selecionado
				let current = typeof lastSelectedIndex === 'number' && lastSelectedIndex >= 0 ? lastSelectedIndex : -1;
				if (current === -1 && Array.isArray(selectedMatrixRows) && selectedMatrixRows.length) {
					const firstPep = selectedMatrixRows[0];
					const idx = rows.findIndex(r => r.pep === firstPep);
					if (idx >= 0) current = idx;
				}

				const dir = ev.key === 'ArrowDown' ? 1 : -1;
				let next = current + dir;
				if (next < 0) next = 0;
				if (next > rows.length - 1) next = rows.length - 1;

				if (ev.shiftKey && current >= 0) {
					// estender seleção entre current e next, preservando seleção fora do intervalo atual
					const start = Math.min(current, next);
					const end = Math.max(current, next);
					const range = rows.slice(start, end + 1).map(r => r.pep);
					setSelectedMatrixRows(prev => {
						const preserved = Array.isArray(prev) ? prev.filter(p => {
							const idx = rows.findIndex(r => r.pep === p);
							return idx === -1 || idx < start || idx > end; // mantém itens fora do novo intervalo
						}) : [];
						return Array.from(new Set([...preserved, ...range]));
					});
					setLastSelectedIndex(next);
					scrollToRow(next);
					return;
				}

				// sem shift: selecionar apenas a próxima linha (substitui seleção)
				setSelectedMatrixRows([rows[next].pep]);
				setLastSelectedIndex(next);
				scrollToRow(next);
				return;
			}
		};
		document.addEventListener('keydown', handler);
		return () => document.removeEventListener('keydown', handler);
	}, [lastSelectedIndex, filteredData, selectedMatrixRows]);

	// Atualiza lista de regiões conforme dados carregados (sem aplicar filtros interativos)
	useEffect(() => {
		const m = new Map<string, number>();
		for (const r of rawRows) {
			const s = (r.seccional || '').trim();
			if (!s) continue;
			const v = getFieldNumber(r, 'valor');
			m.set(s, (m.get(s) || 0) + v);
		}
		const regionList = Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map(([name]) => name);
		setRegions(regionList);
	}, [rawRows, getFieldNumber]);

	// Carregar listas dos filtros (Status SAP, Tipo, Grupamento) a partir dos dados carregados
	useEffect(() => {
		const status = new Set<string>()
		const tipos = new Set<string>()
		const agrs = new Set<string>()
		for (const r of rawRows) {
			const s = String(r.statusSap || '').trim(); if (s) status.add(s)
			const t = String(r.tipo || '').trim(); if (t) tipos.add(t)
			const a = String(r.statusAgrupado || '').trim(); if (a) agrs.add(a)
		}
		setStatusSapList(Array.from(status))
		setTiposList(Array.from(tipos))
		setAgrupamentosList(Array.from(agrs))
	}, [rawRows])




	// Carregar dados da aba CarteiraObras via backend (mesmo padrão da página Programacao)
	useEffect(() => {
		let cancelled = false
		getCarteiraObras()
			.then((res) => {
				if (cancelled) return
				const data = (res && (res as { data?: unknown[] }).data) || []
				const rows = Array.isArray(data) ? data as Array<Record<string, unknown>> : []
				const mapped: MatrizItem[] = rows.map(r => {
					const getS = (k: string, alt: string[] = []) => {
						const all = [k, ...alt];
						for (const key of all) {
							if (Object.prototype.hasOwnProperty.call(r, key)) {
								const v = (r as Record<string, unknown>)[key];
								if (v != null && String(v).trim() !== '') return String(v).trim();
							}
						}
						return '';
					};
					const getN = (k: string, alt: string[] = []) => parseMoneyToNumber(getS(k, alt));
					return {
						pep: getS('PEP', ['Pep','pep']),
						prazo: getS('Data limite', ['DATA LIMITE','Prazo','PRAZO','prazo']),
						dataConclusao: getS('data prog/conc', ['Data prog/conc','DATA PROG/CONC','Data Conclusão','DATA CONCLUSÃO','dataConclusao','data']),
						municipio: getS('Municipio', ['Município','MUNICIPIO','municipio']),
						statusSap: getS('STATUS SAP', ['Status SAP','statusSap','status']),
						valor: getN('R$', ['Valor (R$)','Valor','valor','RS','rs']),
						seccional: getS('SECCIONAL', ['Seccional','seccional','Seccao','seccao']),
						tipo: getS('TIPO', ['Tipo','tipo']),
						statusFim: getS('STATUS FIM', ['Status Fim','Status fim','statusFim']),
						statusAgrupado: getS('STATUS AGRUPADO', ['Status Agrupado','Status agrupado','statusAgrupado'])
					}
				})
				setRawRows(mapped as MatrizItem[])
				try {
					showToast(`Carteira de Obras Carregado: ${mapped.length} linhas`)
				} catch (e) { console.debug(e) }
			})
			.catch((err) => {
				console.error('Erro ao carregar CarteiraObras via backend', err)
				try { showToast('Erro ao carregar Carteira de Obras via backend') } catch (e) { console.debug(e) }
			})
		return () => { cancelled = true }
	}, [parseMoneyToNumber])

	// Formata uma string de data para DD/MM/AA (ano com 2 dígitos) caso seja parseável
	const formatToDDMMYY = React.useCallback((s: string) => {
		if (!s) return '';
		const str = String(s).trim();
		const m = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
		if (m) {
			const d = String(m[1]).padStart(2, '0');
			const mo = String(m[2]).padStart(2, '0');
			const yy = String(m[3]);
			const shortYear = yy.length === 4 ? yy.slice(-2) : yy.padStart(2, '0');
			return `${d}/${mo}/${shortYear}`;
		}
		const t = Date.parse(str);
		if (!Number.isNaN(t)) {
			const dt = new Date(t);
			const d = String(dt.getDate()).padStart(2, '0');
			const mo = String(dt.getMonth() + 1).padStart(2, '0');
			const yy = String(dt.getFullYear()).slice(-2);
			return `${d}/${mo}/${yy}`;
		}
		return str;
	}, []);

	// Copiar imagem
	const copyChartImage = async (chartRef: React.RefObject<HTMLDivElement | null>, chartName: string) => {
		if (!chartRef.current) return;
		try {
			const canvas = await html2canvas(chartRef.current, { backgroundColor: '#ffffff', scale: 2, useCORS: true, allowTaint: true });
			canvas.toBlob((blob) => {
					if (blob) {
						try {
							// Fallback seguro: gerar URL e forçar download da imagem
							const url = URL.createObjectURL(blob)
							const a = document.createElement('a')
							a.href = url
							a.download = `grafico-${String(chartName).replace(/\s+/g, '_')}.png`
							document.body.appendChild(a)
							a.click()
							a.remove()
							URL.revokeObjectURL(url)
							showToast(`Imagem do gráfico ${chartName} baixada (fallback)`)
						} catch (e) {
							console.error('Erro ao tentar salvar imagem', e)
							showToast(`Erro ao copiar imagem do gráfico ${chartName}`)
						}
					}
			});
		} catch (error) {
			console.error('Erro ao capturar gráfico:', error);
			showToast(`Erro ao copiar imagem do gráfico ${chartName}`);
		}
	};

	// Exportar Excel
		const handleExportExcel = () => {
			const worksheet = XLSX.utils.json_to_sheet(filteredData.matrix.map(row => ({
				'PEP': row.pep,
				'Data limite': row.dataLimite,
				'SECCIONAL': row.seccional,
				'Municipio': row.municipio,
				'data prog/conc': row.dataProgConc,
				'TIPO': row.tipo,
				'STATUS SAP': row.status,
				'R$': row.rs
			})), { header: ['PEP','Data limite','SECCIONAL','Municipio','data prog/conc','TIPO','STATUS SAP','R$'] });
			const workbook = XLSX.utils.book_new();
			XLSX.utils.book_append_sheet(workbook, worksheet, 'Matriz da Carteira de Obras');
			XLSX.writeFile(workbook, 'matriz_carteira_obras.xlsx');
			showToast('Arquivo Excel exportado com sucesso!');
		};

	// KPIs devem refletir os filtros atuais sobre as linhas usadas na tabela e outros gráficos (rowsForOthers)
	const totalValue = React.useMemo(() => {
		const cents = filteredData.matrix.reduce((sum, row) => sum + Math.round((row.rs || 0) * 100), 0);
		return cents / 100;
	}, [filteredData.matrix]);
	const totalPep = React.useMemo(() => filteredData.matrix.length, [filteredData.matrix.length]);

	return (
		<div className="relative z-10 min-h-screen bg-transparent lovable">
			{/* Fundo animado em toda a página (fixo atrás do conteúdo) - sem badge nesta página */}
			<FundoAnimado showBadge={false} />
			<header className="fixed top-0 left-0 right-0 z-50 border-b border-green-500 shadow-md bg-gradient-to-r from-green-600 via-green-600/90 to-green-700">
				<div className="relative flex items-center justify-between h-16 px-4 pr-8 lg:px-6">
					{/* Título centralizado */}
					<div className="absolute inset-0 flex items-center justify-center pointer-events-none">
						<h1 className="font-inter text-xl sm:text-2xl lg:text-3xl font-extrabold tracking-wide leading-none text-white drop-shadow-[0_3px_6px_rgba(0,0,0,0.35)]">
							Carteira de Obras
						</h1>
					</div>
					<div className="flex items-center gap-3 lg:gap-6">
						<Button
							variant="outline"
							size="sm"
							onClick={() => setSidebarOpen(!sidebarOpen)}
							className="flex items-center gap-2 text-gray-700 transition-all duration-200 bg-white border-gray-300 shadow-md lg:hidden rounded-xl hover:shadow-lg hover:bg-gray-50"
						>
							<Menu className="w-4 h-4" />
						</Button>
						<div className="flex items-center gap-3">
							<div
								className="flex items-center justify-center px-2 ml-4 overflow-hidden font-bold text-center bg-white shadow-md cursor-pointer rounded-xl hover:shadow-lg hover:bg-gray-50"
								onClick={() => navigate('/obras')}
								title="Ir para Obras"
								role="button"
								tabIndex={0}
							>
								<img src={LogoSetup} alt="Grupo Setup" className="object-contain w-auto h-10 max-w-full" />
							</div>
							<Button
								variant="outline"
								size="sm"
								onClick={clearFilters}
								title="Limpar filtros"
								className="flex items-center justify-center w-10 h-10 p-0 text-gray-700 transition-all duration-200 bg-white border-gray-300 shadow-md rounded-xl hover:shadow-lg hover:bg-gray-50"
							>
								<RotateCcw className="w-4 h-4" />
							</Button>
						</div>
					</div>
					<div className="flex items-center gap-2 lg:gap-4">
						<div className="flex items-center gap-2 lg:gap-3">
							<span className="hidden text-xs text-white lg:text-sm sm:inline">Valor Total</span>
							<div className="px-2 py-1 text-sm font-semibold text-green-600 bg-white rounded-lg shadow-md lg:px-4 lg:py-2 lg:rounded-xl lg:text-base w-[105px] text-center whitespace-nowrap">
								{formatValorShort(totalValue)}
							</div>
						</div>
						<div className="flex items-center gap-2 lg:gap-3">
							<span className="hidden text-xs text-white lg:text-sm sm:inline">PEP</span>
							<div className="px-2 py-1 text-sm font-semibold text-green-600 bg-white rounded-lg shadow-md lg:px-4 lg:py-2 lg:rounded-xl lg:text-base w-[105px] text-center whitespace-nowrap">
								{totalPep}
							</div>
						</div>
					</div>
				</div>
			</header>

			<div className="relative flex" style={{ paddingTop: 'calc(4rem + 16px)' }}>
				{sidebarOpen && (
					<div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
				)}

				<aside className={cn(
					"fixed left-0 top-16 bottom-0 w-64 bg-white border-r border-gray-200 shadow-md overflow-y-auto z-50 transition-transform duration-300",
					"lg:translate-x-0 lg:fixed lg:z-auto lg:h-[calc(100vh-4rem)]",
					sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
				)} style={{ direction: 'rtl' }}>
					<div className="p-4 space-y-4 lg:p-6 lg:space-y-6" style={{ direction: 'ltr' }}>
						{/* Logo removido do sidebar para manter apenas no header */}
						<div className="space-y-3">
							<h3 className="text-sm font-semibold tracking-wider text-gray-500 uppercase">Regiões</h3>
							<div className="space-y-2">
								{regions.map((region) => (
									<Button
										key={region}
										variant={selectedRegion === region ? "default" : "outline"}
										onClick={() => {
											const next = selectedRegion === region ? 'all' : region;
											setSelectedRegion(next);
											// sincroniza filtro visual do gráfico Seccionais
											setActiveFilters(prev => {
												const copy = { ...prev } as Record<string,string>;
												if (next === 'all') delete copy.seccionalSelected;
												else copy.seccionalSelected = next;
												return copy;
											});
											setSidebarOpen(false);
										}}
										className="justify-start w-full text-sm transition-all duration-200 shadow-md rounded-xl hover:shadow-lg"
										size="sm"
									>
										{region}
									</Button>
								))}
							</div>
						</div>

						<div className="pt-4 space-y-3 border-t border-gray-200">
							<h3 className="text-sm font-semibold tracking-wider text-gray-500 uppercase">Filtros</h3>
							<select
								value={selectedStatusSap}
								onChange={(e) => setSelectedStatusSap(e.target.value)}
								className={`w-full h-10 px-3 text-sm border rounded-xl shadow-md transition-all duration-200 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${selectedStatusSap ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-900 border-gray-200'}`}
							>
								<option value="">Status SAP</option>
								{statusSapList.map((s) => (
									<option key={s} value={s}>{s}</option>
								))}
							</select>
							<select
								value={selectedTipo}
								onChange={(e) => setSelectedTipo(e.target.value)}
								className={`w-full h-10 px-3 text-sm border rounded-xl shadow-md transition-all duration-200 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${selectedTipo ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-900 border-gray-200'}`}
							>
								<option value="">Tipo</option>
								{tiposList.map((t) => (
									<option key={t} value={t}>{t}</option>
								))}
							</select>
							<select
								value={selectedGrouping}
								onChange={(e) => setSelectedGrouping(e.target.value)}
								className={`w-full h-10 px-3 text-sm border rounded-xl shadow-md transition-all duration-200 hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-green-500 ${selectedGrouping ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-900 border-gray-200'}`}
							>
								<option value="">Grupamento</option>
								{agrupamentosList.map((a) => (
									<option key={a} value={a}>{a}</option>
								))}
							</select>
						</div>

						<div className="pt-4 border-t border-gray-200">
							<DateRangeFilter
								startDate={selectedStartDate}
								endDate={selectedEndDate}
								onStartDateChange={setSelectedStartDate}
								onEndDateChange={setSelectedEndDate}
							/>
						</div>

						<div className="pt-4 border-t border-gray-200">
							<PEPSearch searchValue={pepSearch} onSearchChange={setPepSearch} onClearSearch={clearPepSearch} />
						</div>
					</div>
				</aside>

				<main className="flex-1 w-full px-2 pt-0 pb-2 sm:px-4 lg:px-6 sm:pb-4 lg:pb-6 lg:ml-64">
					<div className="lg:h-[calc(100vh-8rem)] lg:min-h-[500px] lg:max-h-[calc(100vh-8rem)] mb-8">
						<div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:gap-3 lg:h-full lg:grid-rows-2">
								<Card className="shadow-card hover:shadow-card-hover bg-white border-gray-200 transform transition-all duration-300 hover:scale-[1.02] overflow-hidden order-2" ref={statusENERRef} tabIndex={0}>
								<CardHeader className="flex flex-row items-center justify-between bg-white border-b border-gray-300 rounded-t-xl">
									<CardTitle className="text-lg font-semibold text-secondary-foreground">Em Andamento</CardTitle>
									<Button
										size="sm"
										onClick={() => copyChartImage(statusENERRef, 'Em Andamento')}
										className="w-8 h-8 p-0 text-gray-700 transition-all duration-200 bg-white border border-gray-300 shadow-md rounded-xl hover:bg-gray-50 hover:shadow-lg focus:outline-none focus:ring-0 ring-0"
										title="Copiar imagem (ou clique no gráfico e Ctrl+C)"
									>
										<Copy className="w-4 h-4" />
									</Button>
								</CardHeader>
								<CardContent className="p-4">
									<ChartContainer config={{ value: { label: "R$", color: "hsl(var(--primary))" } }} className="h-64 sm:h-72 md:h-80 lg:h-[calc((100vh-20rem)/2)] lg:max-h-[350px] w-full">
										<ResponsiveContainer width="100%" height="100%">
											<BarChart data={emAndamentoData} margin={{ top: 20, right: 10, bottom: 55, left: 10 }} barGap={6} barCategoryGap={16}>
												<CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
												<XAxis dataKey="name" fontSize={12} tickMargin={8} interval={0} tick={(props: unknown) => {
													const p = props as ChartTickProps;
													const value = p && p.payload ? p.payload.value : '';
													return (
															<g transform={`translate(${p.x},${p.y})`} style={{ cursor: 'pointer' }} onClick={() => handleChartClick('statusEmAndamento', String(value))}>
															<TwoLineTick x={0} y={0} payload={{ value: String(value) }} />
														</g>
													);
												}} />
												<YAxis yAxisId="left" hide domain={[0, 'dataMax']} />
												<YAxis yAxisId="right" orientation="right" hide domain={[0, 'dataMax']} />
												<Tooltip
													contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', boxShadow: 'var(--shadow-elegant)' }}
													formatter={(value, _name, item) => {
														const num = typeof value === 'number' ? value : Number(value) || 0;
														type TP = { dataKey?: string | number } | undefined;
														const payload = (Array.isArray(item) ? item[0] : item) as TP;
														const dataKey = payload && payload.dataKey;
														if (dataKey === 'value') return [`R$ ${num.toLocaleString('pt-BR')}`, 'Valor'];
														return [num.toLocaleString('pt-BR'), 'PEP'];
													}}
												/>
												<Bar yAxisId="left" dataKey="qtd" fill="url(#chartGreenGradientComparison)" radius={[8, 8, 0, 0]}>
													{emAndamentoData.map((_entry, index) => {
														const globalSelected = activeFilters.statusEmAndamento || activeFilters.statusConcluida || activeFilters.statusParada;
														const name = emAndamentoData[index]?.name || '';
														const faded = globalSelected && (activeFilters.statusEmAndamento ? activeFilters.statusEmAndamento !== name : true);
														return (
															<Cell key={`cell-${index}`} fill={"url(#chartGreenGradientComparison)"} fillOpacity={faded ? 0.5 : 1} onClick={() => handleChartClick('statusEmAndamento', name)} />
														)
													})}
													<LabelList dataKey="qtd" content={makeLabelRenderer(
														emAndamentoQty,
														() => false,
													)} />
												</Bar>
												<Bar yAxisId="right" dataKey="value" fill="url(#chartBlueGradientValue)" radius={[8, 8, 0, 0]}>
													{emAndamentoData.map((_entry, index) => {
														const globalSelected = activeFilters.statusEmAndamento || activeFilters.statusConcluida || activeFilters.statusParada;
														const name = emAndamentoData[index]?.name || '';
														const faded = globalSelected && (activeFilters.statusEmAndamento ? activeFilters.statusEmAndamento !== name : true);
														return (
															<Cell key={`cellv-${index}`} fill={"url(#chartBlueGradientValue)"} fillOpacity={faded ? 0.5 : 1} onClick={() => handleChartClick('statusEmAndamento', name)} />
														)
													})}
													<LabelList dataKey="value" content={makeValueLabelRenderer(
														emAndamentoValue,
														() => false,
													)} />
												</Bar>
												<defs>
													<linearGradient id="chartGreenGradientComparison" x1="0" y1="0" x2="0" y2="1">
														<stop offset="0%" stopColor="hsl(142 90% 45%)" />
														<stop offset="50%" stopColor="hsl(142 85% 42%)" />
														<stop offset="100%" stopColor="hsl(142 76% 36%)" />
													</linearGradient>
													<linearGradient id="chartBlueGradientValue" x1="0" y1="0" x2="0" y2="1">
														<stop offset="0%" stopColor="#3b82f6" />
														<stop offset="50%" stopColor="#1d4ed8" />
														<stop offset="100%" stopColor="#1e3a8a" />
													</linearGradient>
												</defs>
											</BarChart>
										</ResponsiveContainer>
									</ChartContainer>
								</CardContent>
							</Card>

								<Card className="shadow-card hover:shadow-card-hover bg-white border-gray-200 transform transition-all duration-300 hover:scale-[1.02] overflow-hidden order-1" ref={comparisonRef} tabIndex={0}>
								<CardHeader className="flex flex-row items-center justify-between bg-white border-b border-gray-300 rounded-t-xl">
									<CardTitle className="text-lg font-semibold text-secondary-foreground">Concluídas</CardTitle>
									<Button
										size="sm"
										onClick={() => copyChartImage(comparisonRef, 'Concluídas')}
										className="w-8 h-8 p-0 text-gray-700 transition-all duration-200 bg-white border border-gray-300 shadow-md rounded-xl hover:bg-gray-50 hover:shadow-lg focus:outline-none focus:ring-0 ring-0"
										title="Copiar imagem (ou clique no gráfico e Ctrl+C)"
									>
										<Copy className="w-4 h-4" />
									</Button>
								</CardHeader>
								<CardContent className="p-4">
									<ChartContainer config={{ value: { label: "R$", color: "hsl(var(--primary))" } }} className="h-64 sm:h-72 md:h-80 lg:h-[calc((100vh-20rem)/2)] lg:max-h-[350px] w-full">
										<ResponsiveContainer width="100%" height="100%">
											<BarChart data={concluidasChartData} margin={{ top: 20, right: 10, bottom: 55, left: 10 }} barGap={6} barCategoryGap={16}>
												<CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
												<XAxis dataKey="name" fontSize={12} tickMargin={8} interval={0} tick={(props: unknown) => {
													const p = props as ChartTickProps;
													const value = p && p.payload ? p.payload.value : '';
													return (
														<g transform={`translate(${p.x},${p.y})`} style={{ cursor: 'pointer' }} onClick={() => handleChartClick('statusConcluida', String(value))}>
															<TwoLineTick x={0} y={0} payload={{ value: String(value) }} />
														</g>
													);
												}} />
												<YAxis yAxisId="left" hide domain={[0, 'dataMax']} />
												<YAxis yAxisId="right" orientation="right" hide domain={[0, 'dataMax']} />
												<Tooltip
													contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', boxShadow: 'var(--shadow-elegant)' }}
													formatter={(value, _name, item) => {
														const num = typeof value === 'number' ? value : Number(value) || 0;
														type TP = { dataKey?: string | number } | undefined;
														const payload = (Array.isArray(item) ? item[0] : item) as TP;
														const dataKey = payload && payload.dataKey;
														if (dataKey === 'value') return [`R$ ${num.toLocaleString('pt-BR')}`, 'Valor'];
														return [num.toLocaleString('pt-BR'), 'PEP'];
													}}
												/>
												<Bar yAxisId="left" dataKey="qtd" fill="url(#chartGreenGradientComparison)" radius={[8, 8, 0, 0]}>
													{concluidasChartData.map((_entry, index) => {
														const globalSelected = activeFilters.statusEmAndamento || activeFilters.statusConcluida || activeFilters.statusParada;
														const name = concluidasChartData[index]?.name || '';
														const faded = globalSelected && (activeFilters.statusConcluida ? activeFilters.statusConcluida !== name : true);
														return (
															<Cell key={`cell-${index}`} fill={"url(#chartGreenGradientComparison)"} fillOpacity={faded ? 0.5 : 1} onClick={() => handleChartClick('statusConcluida', name)} />
														)
													})}
													<LabelList dataKey="qtd" content={makeLabelRenderer(
														concluidasChartQty,
														() => false,
													)} />
												</Bar>
												<Bar yAxisId="right" dataKey="value" fill="url(#chartBlueGradientValue)" radius={[8, 8, 0, 0]}>
													{concluidasChartData.map((_entry, index) => {
														const globalSelected = activeFilters.statusEmAndamento || activeFilters.statusConcluida || activeFilters.statusParada;
														const name = concluidasChartData[index]?.name || '';
														const faded = globalSelected && (activeFilters.statusConcluida ? activeFilters.statusConcluida !== name : true);
														return (
															<Cell key={`cellv-${index}`} fill={"url(#chartBlueGradientValue)"} fillOpacity={faded ? 0.5 : 1} onClick={() => handleChartClick('statusConcluida', name)} />
														)
													})}
													<LabelList dataKey="value" content={makeValueLabelRenderer(
														concluidasChartValue,
														() => false,
													)} />
												</Bar>
												{/* Sem pilha: padrão idêntico ao gráfico Em Andamento */}
												<defs>
													<linearGradient id="chartGreenGradientComparison" x1="0" y1="0" x2="0" y2="1">
														<stop offset="0%" stopColor="hsl(142 90% 45%)" />
														<stop offset="50%" stopColor="hsl(142 85% 42%)" />
														<stop offset="100%" stopColor="hsl(142 76% 36%)" />
													</linearGradient>
													<linearGradient id="chartBlueGradientValue" x1="0" y1="0" x2="0" y2="1">
														<stop offset="0%" stopColor="#3b82f6" />
														<stop offset="50%" stopColor="#1d4ed8" />
														<stop offset="100%" stopColor="#1e3a8a" />
													</linearGradient>
												</defs>
											</BarChart>
										</ResponsiveContainer>
									</ChartContainer>
									{concluidasIndic ? (
										<div className="flex flex-wrap items-center justify-center w-full gap-4 px-2 -mt-2 text-sm text-gray-700">
											<span className="font-medium">{concluidasIndic.name}:</span>
											<span className="flex items-center gap-2 cursor-pointer select-none" onClick={() => handleChartClick('statusConcluida', concluidasIndic.name)} title="Filtrar por esta categoria">
												<span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'linear-gradient(180deg, hsl(142 90% 45%), hsl(142 76% 36%))' }} />
												<span className="tabular-nums">{concluidasIndic.qtd.toLocaleString('pt-BR')} PEP</span>
											</span>
											<span className="flex items-center gap-2 cursor-pointer select-none" onClick={() => handleChartClick('statusConcluida', concluidasIndic.name)} title="Filtrar por esta categoria">
												<span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'linear-gradient(180deg, #3b82f6, #1e3a8a)' }} />
												<span className="tabular-nums">{formatMilExtenso(concluidasIndic.value)}</span>
											</span>
										</div>
									) : null}
								</CardContent>
							</Card>

								<Card className="shadow-card hover:shadow-card-hover bg-white border-gray-200 transform transition-all duration-300 hover:scale-[1.02] overflow-hidden order-3" ref={statusCONCRef} tabIndex={0}>
								<CardHeader className="flex flex-row items-center justify-between bg-white border-b border-gray-300 rounded-t-xl">
									<CardTitle className="text-lg font-semibold text-secondary-foreground">Paradas</CardTitle>
									<Button
										size="sm"
										onClick={() => copyChartImage(statusCONCRef, 'Paradas')}
										className="w-8 h-8 p-0 text-gray-700 transition-all duration-200 bg-white border border-gray-300 shadow-md rounded-xl hover:bg-gray-50 hover:shadow-lg focus:outline-none focus:ring-0 ring-0"
										title="Copiar imagem (ou clique no gráfico e Ctrl+C)"
									>
										<Copy className="w-4 h-4" />
									</Button>
								</CardHeader>
								<CardContent className="p-4">
									<ChartContainer config={{ value: { label: "R$", color: "hsl(var(--primary))" } }} className="h-64 sm:h-72 md:h-80 lg:h-[calc((100vh-20rem)/2)] lg:max-h-[350px] w-full">
										<ResponsiveContainer width="100%" height="100%">
											<BarChart data={paradasChartData} margin={{ top: 20, right: 10, bottom: 55, left: 10 }} barGap={6} barCategoryGap={16}>
												<CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
												<XAxis dataKey="name" fontSize={12} tickMargin={8} interval={0} tick={(props: unknown) => {
													const p = props as ChartTickProps;
													const value = p && p.payload ? p.payload.value : '';
													return (
														<g transform={`translate(${p.x},${p.y})`} style={{ cursor: 'pointer' }} onClick={() => handleChartClick('statusParada', String(value))}>
															<TwoLineTick x={0} y={0} payload={{ value: String(value) }} />
														</g>
													);
												}} />
												<YAxis yAxisId="left" hide domain={[0, 'dataMax']} />
												<YAxis yAxisId="right" orientation="right" hide domain={[0, 'dataMax']} />
												<Tooltip
													contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', boxShadow: 'var(--shadow-elegant)' }}
													formatter={(value, _name, item) => {
														const num = typeof value === 'number' ? value : Number(value) || 0;
														type TP = { dataKey?: string | number } | undefined;
														const payload = (Array.isArray(item) ? item[0] : item) as TP;
														const dataKey = payload && payload.dataKey;
														if (dataKey === 'value') return [`R$ ${num.toLocaleString('pt-BR')}`, 'Valor'];
														return [num.toLocaleString('pt-BR'), 'PEP'];
													}}
												/>
												<Bar yAxisId="left" dataKey="qtd" fill="url(#chartGreenGradientConc)" radius={[8, 8, 0, 0]}>
													{paradasChartData.map((_entry, index) => {
														const globalSelected = activeFilters.statusEmAndamento || activeFilters.statusConcluida || activeFilters.statusParada;
														const name = paradasChartData[index]?.name || '';
														const faded = globalSelected && (activeFilters.statusParada ? activeFilters.statusParada !== name : true);
														return (
															<Cell key={`cell-${index}`} fill={"url(#chartGreenGradientConc)"} fillOpacity={faded ? 0.5 : 1} onClick={() => handleChartClick('statusParada', name)} />
														)
													})}
													<LabelList dataKey="qtd" content={makeLabelRenderer(
														paradasChartQty,
														() => false,
													)} />
												</Bar>
												<Bar yAxisId="right" dataKey="value" fill="url(#chartBlueGradientValue)" radius={[8, 8, 0, 0]}>
													{paradasChartData.map((_entry, index) => {
														const globalSelected = activeFilters.statusEmAndamento || activeFilters.statusConcluida || activeFilters.statusParada;
														const name = paradasChartData[index]?.name || '';
														const faded = globalSelected && (activeFilters.statusParada ? activeFilters.statusParada !== name : true);
														return (
															<Cell key={`cellv-${index}`} fill={"url(#chartBlueGradientValue)"} fillOpacity={faded ? 0.5 : 1} onClick={() => handleChartClick('statusParada', name)} />
														)
													})}
													<LabelList dataKey="value" content={makeValueLabelRenderer(
														paradasChartValue,
														() => false,
													)} />
												</Bar>
												{/* Sem pilha: padrão idêntico ao gráfico Em Andamento */}
												<defs>
													<linearGradient id="chartGreenGradientConc" x1="0" y1="0" x2="0" y2="1">
														<stop offset="0%" stopColor="hsl(142 90% 45%)" />
														<stop offset="50%" stopColor="hsl(142 85% 42%)" />
														<stop offset="100%" stopColor="hsl(142 76% 36%)" />
													</linearGradient>
													<linearGradient id="chartBlueGradientValue" x1="0" y1="0" x2="0" y2="1">
														<stop offset="0%" stopColor="#3b82f6" />
														<stop offset="50%" stopColor="#1d4ed8" />
														<stop offset="100%" stopColor="#1e3a8a" />
													</linearGradient>
												</defs>
											</BarChart>
										</ResponsiveContainer>
									</ChartContainer>
								{paradasIndic ? (
									<div className="flex flex-wrap items-center justify-center w-full gap-4 px-2 -mt-2 text-sm text-gray-700">
										<span className="font-medium">{paradasIndic.name}:</span>
										<span className="flex items-center gap-2 cursor-pointer select-none" onClick={() => handleChartClick('statusParada', paradasIndic.name)} title="Filtrar por esta categoria">
											<span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'linear-gradient(180deg, hsl(142 90% 45%), hsl(142 76% 36%))' }} />
											<span className="tabular-nums">{paradasIndic.qtd.toLocaleString('pt-BR')} PEP</span>
										</span>
										<span className="flex items-center gap-2 cursor-pointer select-none" onClick={() => handleChartClick('statusParada', paradasIndic.name)} title="Filtrar por esta categoria">
											<span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: 'linear-gradient(180deg, #3b82f6, #1e3a8a)' }} />
											<span className="tabular-nums">{formatMilExtenso(paradasIndic.value)}</span>
										</span>
									</div>
								) : null}
								</CardContent>
							</Card>

								<Card className="shadow-card hover:shadow-card-hover bg-white border-gray-200 transform transition-all duration-300 hover:scale-[1.02] overflow-hidden order-4" ref={reasonsRef} tabIndex={0}>
									<CardHeader className="flex flex-row items-center justify-between bg-white border-b border-gray-300 rounded-t-xl">
										<CardTitle className="text-lg font-semibold text-secondary-foreground">Seccionais</CardTitle>
										<Button
											size="sm"
											onClick={() => copyChartImage(reasonsRef, 'Seccionais')}
											className="w-8 h-8 p-0 text-gray-700 transition-all duration-200 bg-white border border-gray-300 shadow-md rounded-xl hover:bg-gray-50 hover:shadow-lg focus:outline-none focus:ring-0 ring-0"
											title="Copiar imagem (ou clique no gráfico e Ctrl+C)"
										>
											<Copy className="w-4 h-4" />
										</Button>
									</CardHeader>
									<CardContent className="p-4">
										<ChartContainer config={{ value: { label: "R$", color: "hsl(var(--primary))" } }} className="h-64 sm:h-72 md:h-80 lg:h-[calc((100vh-20rem)/2)] lg:max-h-[350px] w-full">
											<ResponsiveContainer width="100%" height="100%">
												<BarChart data={filteredData.comparison} margin={{ top: 20, right: 10, bottom: 55, left: 10 }} barGap={6} barCategoryGap={10}>
													<CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
													<XAxis dataKey="name" fontSize={12} tickMargin={8} interval={0} minTickGap={0} tick={(props: unknown) => {
														const p = props as ChartTickProps;
													const value = p && p.payload ? p.payload.value : '';
														return (
															<g transform={`translate(${p.x},${p.y})`} style={{ cursor: 'pointer' }} onClick={() => handleChartClick('seccionalSelected', String(value))}>
																<TwoLineTick x={0} y={0} payload={{ value: String(value) }} />
															</g>
														);
													}} />
													<YAxis yAxisId="left" hide domain={[0, 'dataMax']} />
													<YAxis yAxisId="right" orientation="right" hide domain={[0, 'dataMax']} />
													<Tooltip contentStyle={{ backgroundColor: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', boxShadow: 'var(--shadow-elegant)' }} formatter={(value, _name, item) => {
														const num = typeof value === 'number' ? value : Number(value) || 0;
														type TP = { dataKey?: string | number } | undefined;
														const payload = (Array.isArray(item) ? item[0] : item) as TP;
														const dataKey = payload && payload.dataKey;
														if (dataKey === 'value') return [`R$ ${num.toLocaleString('pt-BR')}`, 'Valor'];
														return [num.toLocaleString('pt-BR'), 'PEP'];
													}} />
													<Bar yAxisId="left" dataKey="qtd" fill="url(#chartGreenGradientComparison)" radius={[8, 8, 0, 0]}>
														{filteredData.comparison.map((_entry, index) => {
															const selected = activeFilters.seccionalSelected || (selectedRegion !== 'all' ? selectedRegion : '');
															const name = filteredData.comparison[index]?.name || '';
															const faded = selected && selected !== name;
															return (
																<Cell key={`cell-secc-${index}`} fill={"url(#chartGreenGradientComparison)"} fillOpacity={faded ? 0.5 : 1} onClick={() => handleChartClick('seccionalSelected', name)} />
															)
														})}
														<LabelList dataKey="qtd" content={makeLabelRenderer(
															seccionaisQty,
															() => false,
														)} />
													</Bar>
													<Bar yAxisId="right" dataKey="value" fill="url(#chartBlueGradientValue)" radius={[8, 8, 0, 0]}>
														{filteredData.comparison.map((_entry, index) => {
															const selected = activeFilters.seccionalSelected || (selectedRegion !== 'all' ? selectedRegion : '');
															const name = filteredData.comparison[index]?.name || '';
															const faded = selected && selected !== name;
															return (
																<Cell key={`cellv-secc-${index}`} fill={"url(#chartBlueGradientValue)"} fillOpacity={faded ? 0.5 : 1} onClick={() => handleChartClick('seccionalSelected', name)} />
															)
														})}
														<LabelList dataKey="value" content={makeValueLabelRenderer(
															seccionaisValue,
															() => false,
														)} />
													</Bar>
													<defs>
														<linearGradient id="chartGreenGradientComparison" x1="0" y1="0" x2="0" y2="1">
															<stop offset="0%" stopColor="hsl(142 90% 45%)" />
															<stop offset="50%" stopColor="hsl(142 85% 42%)" />
															<stop offset="100%" stopColor="hsl(142 76% 36%)" />
														</linearGradient>
														<linearGradient id="chartBlueGradientValue" x1="0" y1="0" x2="0" y2="1">
															<stop offset="0%" stopColor="#3b82f6" />
															<stop offset="50%" stopColor="#1d4ed8" />
															<stop offset="100%" stopColor="#1e3a8a" />
														</linearGradient>
													</defs>
												</BarChart>
											</ResponsiveContainer>
										</ChartContainer>
									</CardContent>
								</Card>
						</div>
					</div>

						<Card className="transition-all duration-300 bg-white border-gray-200 shadow-card hover:shadow-card-hover">
						<CardHeader className="flex flex-row items-center justify-between bg-white border-b border-gray-300 rounded-t-xl">
							<CardTitle className="text-lg font-semibold text-secondary-foreground">Matriz da Carteira de Obras</CardTitle>
							<Button
								size="sm"
								onClick={handleExportExcel}
								className="flex items-center gap-2 text-gray-700 transition-all duration-200 bg-white border border-gray-300 shadow-md rounded-xl hover:bg-gray-50 hover:shadow-lg focus:outline-none focus:ring-0 ring-0"
							>
								<Copy className="w-4 h-4" />
								Exportar Excel
							</Button>
						</CardHeader>
						<CardContent className="p-0">
							<div className="overflow-x-auto" ref={tableWrapperRef}>
								<Table>
									<TableHeader>
										<TableRow className="bg-gray-50 hover:bg-gray-100">
													<TableHead className="font-semibold text-gray-700 transition-colors cursor-pointer select-none hover:bg-gray-200 w-[180px] text-center" onClick={() => handleSort('pep')}>
														<div className="flex items-center justify-center gap-2">PEP {getSortIcon('pep')}</div>
													</TableHead>
												<TableHead className="font-semibold text-center text-gray-700 transition-colors cursor-pointer select-none hover:bg-gray-200" onClick={() => handleSort('dataLimite')}>
													<div className="flex items-center justify-center gap-2">Limite {getSortIcon('dataLimite')}</div>
												</TableHead>
												<TableHead className="font-semibold text-center text-gray-700 transition-colors cursor-pointer select-none hover:bg-gray-200" onClick={() => handleSort('seccional')}>
													<div className="flex items-center justify-center gap-2">Seccional {getSortIcon('seccional')}</div>
												</TableHead>
												<TableHead className="font-semibold text-center text-gray-700 transition-colors cursor-pointer select-none hover:bg-gray-200" onClick={() => handleSort('municipio')}>
													<div className="flex items-center justify-center gap-2">Município {getSortIcon('municipio')}</div>
												</TableHead>
												<TableHead className="font-semibold text-center text-gray-700 transition-colors cursor-pointer select-none hover:bg-gray-200" onClick={() => handleSort('dataProgConc')}>
													<div className="flex items-center justify-center gap-2">Data {getSortIcon('dataProgConc')}</div>
												</TableHead>
												<TableHead className="font-semibold text-center text-gray-700 transition-colors cursor-pointer select-none hover:bg-gray-200" onClick={() => handleSort('tipo')}>
													<div className="flex items-center justify-center gap-2">Tipo {getSortIcon('tipo')}</div>
												</TableHead>
												<TableHead className="font-semibold text-center text-gray-700 transition-colors cursor-pointer select-none hover:bg-gray-200" onClick={() => handleSort('status')}>
													<div className="flex items-center justify-center gap-2">Status SAP {getSortIcon('status')}</div>
												</TableHead>
												<TableHead className="font-semibold text-center text-gray-700 transition-colors cursor-pointer select-none hover:bg-gray-200" onClick={() => handleSort('rs')}>
													<div className="flex items-center justify-center gap-2">R$ {getSortIcon('rs')}</div>
												</TableHead>
											</TableRow>
										</TableHeader>
									<TableBody>
										{filteredData.matrix.map((row, index) => (
											<TableRow
												data-row-index={index}
												key={index}
												className={cn(
													"cursor-pointer transition-all duration-200 select-none",
													(Array.isArray(selectedMatrixRows) && selectedMatrixRows.includes(row.pep))
														? "bg-green-50 border-l-4 border-l-green-600 shadow-md hover:bg-green-100"
														: "hover:bg-gray-50"
												)}
												onClick={(e: React.MouseEvent) => {
												// Shift+click => range select (preserva seleção existente fora do intervalo)
												if (e.shiftKey && typeof lastSelectedIndex === 'number' && lastSelectedIndex !== null) {
													e.preventDefault();
													const start = Math.min(lastSelectedIndex, index);
													const end = Math.max(lastSelectedIndex, index);
													const range = filteredData.matrix.slice(start, end + 1).map(r => r.pep);
													setSelectedMatrixRows(prev => {
														const preserved = Array.isArray(prev) ? prev.filter(p => {
															const idx = filteredData.matrix.findIndex(r => r.pep === p);
															return idx === -1 || idx < start || idx > end; // mantém itens fora do novo intervalo
														}) : [];
														return Array.from(new Set([...preserved, ...range]));
													});
													setLastSelectedIndex(index);
													scrollToRow(index);
													return;
												}
												// Ctrl (Windows/Linux) ou Meta (Mac) -> toggle selection
												if ((e.ctrlKey || e.metaKey)) {
													e.preventDefault();
													setSelectedMatrixRows(prev => {
														if (Array.isArray(prev) && prev.includes(row.pep)) return prev.filter(p => p !== row.pep);
														return Array.isArray(prev) ? [...prev, row.pep] : [row.pep];
													});
													// atualiza índice do último clique
													setLastSelectedIndex(index);
													scrollToRow(index);
												} else {
													// single selection
													setSelectedMatrixRows([row.pep]);
													setLastSelectedIndex(index);
													scrollToRow(index);
												}
												}
											}
											onContextMenu={(e: React.MouseEvent) => {
												e.preventDefault();
												// open reusable context menu with two actions
												const cx = e.clientX;
												const cy = e.clientY;
												setContextPos({ x: cx, y: cy });
												setContextItems([
													{
														id: 'copy-servicos',
														label: 'COPIAR SERVIÇOS',
														onClick: () => {
															const selected = (Array.isArray(selectedMatrixRows) && selectedMatrixRows.length) ? selectedMatrixRows : [row.pep];
															const lines = filteredData.matrix.filter(r => selected.includes(r.pep)).map(r => r.pep);
															navigator.clipboard.writeText(lines.join('\n')).then(() => showToast('Serviços copiados!')).catch(() => showToast('Erro ao copiar'));
															setContextOpen(false);
														}
													},
													{
														id: 'copy-table',
														label: 'COPIAR TABELA',
														onClick: () => {
															const selected = (Array.isArray(selectedMatrixRows) && selectedMatrixRows.length) ? selectedMatrixRows : [row.pep];
															const rowsToCopy = filteredData.matrix.filter(r => selected.includes(r.pep));
															const tsv = rowsToCopy.map(r => [r.pep, r.dataLimite, r.seccional, r.municipio, r.dataProgConc, r.tipo, r.status, r.rs].join('\t')).join('\n');
															navigator.clipboard.writeText(tsv).then(() => showToast('Tabela copiada!')).catch(() => showToast('Erro ao copiar'));
															setContextOpen(false);
														}
													}
												]);
												setContextOpen(true);
											}}
											onAuxClick={(e: React.MouseEvent) => {
												// botão do meio (wheel/middle) geralmente tem button === 1
												if ((e as React.MouseEvent).button === 1) {
													e.preventDefault();
													const raw = String(row.rs || '0');
													navigator.clipboard.writeText(raw).then(() => {
													showToast(`Valor R$ ${row.rs.toLocaleString('pt-BR')} copiado!`);
													}).catch(() => showToast('Erro ao copiar valor'));
												}
											}}
											title="Ctrl/Cmd+clique para selecionar múltiplas linhas. Clique com o botão direito para abrir menu de copiar"
											>
												<TableCell className="font-mono text-sm min-w-[160px] whitespace-nowrap">{row.pep}</TableCell>
												<TableCell className="text-sm">{formatToDDMMYY(row.dataLimite)}</TableCell>
												<TableCell className="text-sm">{row.seccional}</TableCell>
												<TableCell className="text-sm">{row.municipio}</TableCell>
												<TableCell className="text-sm">{formatToDDMMYY(row.dataProgConc)}</TableCell>
												<TableCell className="text-sm">{row.tipo}</TableCell>
												<TableCell>
													<span className={`px-3 py-1 rounded-full text-xs font-medium ${row.status === 'Concluído' ? 'bg-green-100 text-green-700 border border-green-300' : 'bg-yellow-100 text-yellow-800 border border-yellow-300'}`}>
														{row.status}
													</span>
												</TableCell>
												<TableCell className="font-semibold">R$ {Math.round(row.rs).toLocaleString('pt-BR')}</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
						</CardContent>
					</Card>
				</main>
			</div>

		{/* Context menu shared component */}
		<ContextMenu
			open={contextOpen}
			position={contextPos}
			items={contextItems}
			onClose={() => setContextOpen(false)}
		/>
		{/* Runtime error overlay */}
		{runtimeError ? (
			<div className="fixed inset-0 flex items-center justify-center p-4 z-80 bg-black/60">
				<div className="w-full max-w-2xl p-6 bg-white rounded-lg shadow-lg">
					<h2 className="mb-2 text-lg font-semibold">Erro na página Carteira de Obras</h2>
					<p className="mb-4 text-sm text-gray-700">{runtimeError}</p>
					<div className="text-right">
						<button className="px-4 py-2 text-white bg-green-600 rounded" onClick={() => setRuntimeError(null)}>Fechar</button>
					</div>
				</div>
			</div>
		) : null}
		</div>
	);
}
