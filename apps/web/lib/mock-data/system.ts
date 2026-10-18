type CatalogItem = { id: string; title: string; category: string; description: string };
export const reports: CatalogItem[] = [
  { id: "REL-001", title: "Ocupação dos imóveis", category: "Patrimônio", description: "Distribuição da carteira entre imóveis alugados, disponíveis e em manutenção." },
  { id: "REL-002", title: "Receitas e recebimentos", category: "Financeiro", description: "Comparativo entre previsão de receita e recebimentos por competência." },
  { id: "REL-003", title: "Inadimplência", category: "Financeiro", description: "Cobranças vencidas e valores em aberto por locação." },
  { id: "REL-004", title: "Contratos e renovações", category: "Contratual", description: "Vigências, encerramentos e oportunidades de renovação da carteira." },
  { id: "REL-005", title: "Manutenções", category: "Operação", description: "Acompanhamento de solicitações por categoria, prioridade e situação." },
  { id: "REL-006", title: "Desempenho patrimonial", category: "Patrimônio", description: "Visão consolidada de ocupação e receita contratada dos imóveis." },
];
export const settings: CatalogItem[] = [
  { id: "organization", title: "Organização", category: "Institucional", description: "Identificação da administradora e informações institucionais." },
  { id: "branding", title: "Identidade visual", category: "Marca", description: "Marca e apresentação visual da organização." },
  { id: "users", title: "Usuários e permissões", category: "Equipe", description: "Perfis de acesso e responsabilidades dos membros da equipe." },
  { id: "preferences", title: "Preferências", category: "Experiência", description: "Tema claro ou escuro disponível no botão de tema do cabeçalho. Outras preferências serão disponibilizadas futuramente." },
  { id: "notifications", title: "Notificações", category: "Comunicação", description: "Preferências futuras de canais e frequência de avisos." },
  { id: "security", title: "Segurança", category: "Acesso", description: "Configurações futuras de autenticação e proteção de acesso." },
  { id: "integrations", title: "Integrações", category: "Conexões", description: "Conexões futuras com serviços de assinatura e operações financeiras." },
  { id: "privacy", title: "Dados e privacidade", category: "Governança", description: "Políticas futuras de retenção e gestão de dados da organização." },
];
type Notification = { id: string; title: string; description: string; category: "Pagamentos" | "Contratos" | "Manutenções" | "Vistorias" | "Sistema"; date: string; read: boolean; href?: string };
export const notifications: Notification[] = [
  { id: "NOT-001", title: "Aluguel em atraso", description: "COB-001 · LOC-001: vencimento em 10/10/2026. Valor demonstrativo de R$ 2.400,00.", category: "Pagamentos", date: "2026-10-17", read: false, href: "/app/finance" },
  { id: "NOT-002", title: "Renovação para acompanhamento", description: "CTR-001 · Apartamento Aurora: término previsto em 31/10/2026.", category: "Contratos", date: "2026-10-17", read: false, href: "/app/contracts" },
  { id: "NOT-003", title: "Reparo hidráulico programado", description: "MAN-001 · Studio Jardim: atendimento demonstrativo em 18/10/2026.", category: "Manutenções", date: "2026-10-16", read: false, href: "/app/maintenance" },
  { id: "NOT-004", title: "Vistoria de entrada agendada", description: "VIS-001 · Casa das Oliveiras: programação para 19/10/2026.", category: "Vistorias", date: "2026-10-16", read: true, href: "/app/inspections" },
  { id: "NOT-005", title: "Conheça o ambiente demonstrativo", description: "Os registros desta interface são fictícios. Nenhuma operação cadastral ou financeira é executada.", category: "Sistema", date: "2026-10-15", read: true },
];
