import { createTranslationMessages } from '@backstage/core-plugin-api/alpha';
import { kongServiceManagerTranslationRef } from './ref';

const kongServiceManagerTranslationPtBR = createTranslationMessages({
  ref: kongServiceManagerTranslationRef,
  full: true,
  messages: {
    'homepage.intro':
      'Gerencie a configuração do gateway Kong deste serviço: suas rotas e os plugins que moldam o tráfego. Um plugin adicionado aqui passa a valer no gateway imediatamente, mas só existe no gateway até você promovê-lo para código (uma merge request no chart do serviço).',
    'homepage.tabs.service': 'Serviço',
    'homepage.tabs.plugins': 'Plugins',
    'homepage.tabs.routes': 'Rotas',
    'homepage.createRoute': 'Criar rota',
    'homepage.pluginsScope':
      'Plugins de serviço se aplicam a todas as rotas que este serviço expõe. Para anexar um plugin a uma única rota, use a aba Rotas.',
    'homepage.routesScope':
      'Cada rota pode ter os seus próprios plugins. Um plugin de rota se aplica só àquela rota e tem precedência sobre um plugin de serviço do mesmo tipo.',
    'homepage.pluginDisabled': 'Plugin "{{name}}" desativado',
    'homepage.routeDeleted': 'Rota excluída',
    'homepage.pluginPromotionOpened':
      'Promoção do plugin "{{name}}" aberta — veja o link da MR no selo',
    'homepage.promotionDiscarded': 'Promoção do plugin "{{name}}" descartada',
    'homepage.pluginUpdated': 'Plugin "{{name}}" atualizado',
    'homepage.pluginEnabled': 'Plugin "{{name}}" ativado',
    'homepage.routeUpdated': 'Rota atualizada',
    'homepage.routeCreated': 'Rota criada',

    'pluginConfigDrawer.title': 'Plugin {{pluginName}}',
    'pluginConfigDrawer.noConfigurableFields':
      'Este plugin não tem campos configuráveis.',
    'pluginConfigDrawer.enabled': 'Ativado',
    'pluginConfigDrawer.cancel': 'Cancelar',
    'pluginConfigDrawer.saving': 'Salvando...',
    'pluginConfigDrawer.installing': 'Instalando...',
    'pluginConfigDrawer.reviewPromotion': 'Revisar promoção',
    'pluginConfigDrawer.saveChanges': 'Salvar Alterações',
    'pluginConfigDrawer.installPlugin': 'Instalar Plugin',

    'incrementalFields.add': 'Adicionar',

    'recordFields.newItem': 'Novo Item',
    'recordFields.add': 'Adicionar',
    'recordFields.addEmpty': 'Adicionar Vazio',

    'pluginCard.editTooltip': 'Editar configuração do plugin',
    'pluginCard.enableTooltip': 'Anexa este plugin no gateway.',
    'pluginCard.disableTooltip': 'Remove este plugin do gateway.',
    'pluginCard.promoteToCodeTooltip':
      'Abre uma merge request que move este plugin para o chart do serviço, passando a ser gerenciado pelo Git em vez de existir só no gateway.',
    'pluginCard.editInCodeTooltip':
      'Este plugin é definido no chart do serviço. Abra uma merge request para alterá-lo — nada muda no gateway diretamente.',
    'pluginCard.discardTooltip':
      'Fecha a merge request aberta. O plugin permanece como está agora.',
    'pluginCard.discardPromotion': 'Descartar promoção',
    'pluginCard.disable': 'Desativar',
    'pluginCard.promoteToCode': 'Promover para código',
    'pluginCard.editInCode': 'Editar no código',
    'pluginCard.enable': 'Ativar',
    'pluginCard.managedFromRepository':
      'Gerenciado a partir do repositório — editar aqui seria sobrescrito no próximo deploy.',

    'pluginsList.title': 'Plugins do Kong',
    'pluginsList.searchPlaceholder': 'Buscar plugins...',
    'pluginsList.noPluginsFiltered':
      'Nenhum plugin corresponde a "{{search}}". Tente outro termo de busca.',
    'pluginsList.noPluginsEmpty': 'Nenhum plugin disponível nesta categoria ainda.',
    'pluginsList.allPlugins': 'Todos os Plugins',
    'pluginsList.associatedPlugins': 'Plugins Associados',
    'pluginsList.categories.ai': 'IA',
    'pluginsList.categories.authentication': 'Autenticação',
    'pluginsList.categories.security': 'Segurança',
    'pluginsList.categories.trafficControl': 'Controle de Tráfego',
    'pluginsList.categories.serverless': 'Serverless',
    'pluginsList.categories.transformation': 'Transformações',
    'pluginsList.categories.logging': 'Logs',
    'pluginsList.categories.analytics': 'Análise e Monitoramento',

    'routeForm.editTitle': 'Editar Rota',
    'routeForm.createTitle': 'Criar Rota',
    'routeForm.nameLabel': 'Nome',
    'routeForm.protocolsLabel': 'Protocolos',
    'routeForm.methodsLabel': 'Métodos',
    'routeForm.pathsLabel': 'Caminhos (separados por vírgula)',
    'routeForm.pathsHelper': 'ex.: /api/v1, /health',
    'routeForm.hostsLabel': 'Hosts (separados por vírgula)',
    'routeForm.hostsHelper': 'Opcional, ex.: example.com',
    'routeForm.stripPath': 'Remover Caminho',
    'routeForm.stripPathTooltip':
      'Remove o prefixo de caminho correspondente antes de encaminhar a requisição ao serviço.',
    'routeForm.preserveHost': 'Preservar Host',
    'routeForm.preserveHostTooltip':
      'Encaminha o cabeçalho Host original para o serviço, em vez do host do próprio upstream.',
    'routeForm.cancel': 'Cancelar',
    'routeForm.saving': 'Salvando...',
    'routeForm.save': 'Salvar',

    'promotionBadgeChip.kinds.experimental': 'Experimental',
    'promotionBadgeChip.kinds.codeOwned': 'Definido no código',
    'promotionBadgeChip.kinds.mrOpen': 'Promoção aberta',
    'promotionBadgeChip.kinds.pendingDeploy': 'Aplicando',
    'promotionBadgeChip.kinds.codified': 'Codificado',
    'promotionBadgeChip.kinds.failedRestored': 'Aplicação falhou',
    'promotionBadgeChip.kindTooltips.experimental':
      'Ativo apenas no gateway — ainda não salvo no repositório Git do serviço.',
    'promotionBadgeChip.kindTooltips.mrOpen':
      'Uma merge request para adicionar este experimento ao chart está aberta — mescle e implante para que o plugin passe a ser definido no código.',
    'promotionBadgeChip.kindTooltips.pendingDeploy':
      'A merge request foi mesclada; aguardando a implantação da nova versão do chart para que o plugin passe a ser definido no código.',
    'promotionBadgeChip.kindTooltips.codified':
      'Este plugin agora é definido no chart e gerenciado pelo Git — substituiu o experimento original.',
    'promotionBadgeChip.kindTooltips.failedRestored':
      'A transição automática para o chart falhou; corrija o chart ou reverta a merge request para recuperar.',
    'promotionBadgeChip.codeOwnedTooltip':
      'Definido no chart do serviço; edite por lá',
    'promotionBadgeChip.retry': 'Repetir',
    'promotionBadgeChip.showDetails': 'Mostrar detalhes',
    'promotionBadgeChip.hideDetails': 'Ocultar detalhes',

    'promotionReviewDialog.editTitle': 'Editar {{pluginName}} no código',
    'promotionReviewDialog.promoteTitle': 'Promover {{pluginName}} para código',
    'promotionReviewDialog.editDescription':
      'Isso abre uma merge request no repositório do serviço com a configuração editada. Este plugin já é gerenciado pelo Kong Ingress Controller a partir do chart — nenhum experimento é criado, marcado ou removido.',
    'promotionReviewDialog.promoteDescription':
      'Isso abre uma merge request no repositório do serviço com a configuração equivalente do chart. Assim que ela for mesclada e implantada, o portal verifica o plugin definido no código e remove este experimento.',
    'promotionReviewDialog.liveConfigCurrent': 'Configuração atual (em uso)',
    'promotionReviewDialog.liveConfig': 'Configuração em uso',
    'promotionReviewDialog.editedConfig': 'Configuração editada',
    'promotionReviewDialog.generatedChart': 'Chart gerado',
    'promotionReviewDialog.generatingPreview': 'Gerando pré-visualização...',
    'promotionReviewDialog.cancel': 'Cancelar',
    'promotionReviewDialog.promoteToCode': 'Promover para código',

    'routePluginsDrawer.title': 'Plugins da rota: {{routeLabel}}',
    'routePluginsDrawer.noOwningRepoReason':
      'Este serviço não tem um repositório vinculado para abrir uma merge request.',
    'routePluginsDrawer.noAdapterReason': 'Este tipo de plugin ainda não pode ser promovido para código.',
    'routePluginsDrawer.searchPlaceholder': 'Buscar plugins...',
    'routePluginsDrawer.noPluginsFiltered':
      'Nenhum plugin corresponde a "{{search}}". Tente outro termo de busca.',
    'routePluginsDrawer.noPluginsEmpty': 'Nenhum plugin disponível nesta categoria ainda.',
    'routePluginsDrawer.allPlugins': 'Todos os Plugins',
    'routePluginsDrawer.associatedPlugins': 'Plugins Associados',
    'routePluginsDrawer.categories.ai': 'IA',
    'routePluginsDrawer.categories.authentication': 'Autenticação',
    'routePluginsDrawer.categories.security': 'Segurança',
    'routePluginsDrawer.categories.trafficControl': 'Controle de Tráfego',
    'routePluginsDrawer.categories.serverless': 'Serverless',
    'routePluginsDrawer.categories.transformation': 'Transformações',
    'routePluginsDrawer.categories.logging': 'Logs',
    'routePluginsDrawer.categories.analytics': 'Análise e Monitoramento',

    'routesList.title': 'Rotas',
    'routesList.routeCount': '{{total}} rota(s)',
    'routesList.noRoutes':
      'Ainda não há rotas — crie uma para expor este serviço através do gateway.',
    'routesList.columns.name': 'Nome',
    'routesList.columns.protocols': 'Protocolos',
    'routesList.columns.methods': 'Métodos',
    'routesList.columns.paths': 'Caminhos',
    'routesList.columns.hosts': 'Hosts',
    'routesList.columns.actions': 'Ações',
    'routesList.managePlugins': 'Gerenciar plugins',
    'routesList.editRoute': 'Editar rota',
    'routesList.deleteRoute': 'Excluir rota',
    'routesList.deleteDialog.title': 'Excluir Rota',
    'routesList.deleteDialog.confirmBefore':
      'Tem certeza de que deseja excluir a rota',
    'routesList.deleteDialog.confirmAfter':
      '? Esta ação não pode ser desfeita.',
    'routesList.deleteDialog.cancel': 'Cancelar',
    'routesList.deleteDialog.confirm': 'Excluir',

    'selectInstance.label': 'Instância do Kong',

    'servicePage.idLabel': 'ID: {{id}}',
    'servicePage.enabled': 'Ativado',
    'servicePage.disabled': 'Desativado',
    'servicePage.noServiceInfo':
      'Nenhuma informação de serviço disponível.',
    'servicePage.fields.protocol': 'Protocolo',
    'servicePage.fields.host': 'Host',
    'servicePage.fields.port': 'Porta',
    'servicePage.fields.path': 'Caminho',
    'servicePage.fields.retries': 'Tentativas',
    'servicePage.fields.connectTimeout': 'Tempo Limite de Conexão',
    'servicePage.fields.writeTimeout': 'Tempo Limite de Escrita',
    'servicePage.fields.readTimeout': 'Tempo Limite de Leitura',
  },
});

export default kongServiceManagerTranslationPtBR;
