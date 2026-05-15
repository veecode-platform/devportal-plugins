/*
 * Copyright Red Hat, Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { createTranslationMessages } from '@backstage/core-plugin-api/alpha';
import { globalHeaderTranslationRef } from './ref';

const globalHeaderTranslationPt = createTranslationMessages({
  ref: globalHeaderTranslationRef,
  messages: {
    'help.tooltip': 'Ajuda',
    'help.noSupportLinks': 'Nenhum link de suporte',
    'help.noSupportLinksSubtitle':
      'Seu administrador deve configurar os links de suporte.',
    'help.quickStart': 'Início rápido',
    'help.supportTitle': 'Suporte',
    'profile.picture': 'Imagem de perfil',
    'profile.settings': 'Configurações',
    'profile.myProfile': 'Meu perfil',
    'profile.signOut': 'Sair',
    'search.placeholder': 'Buscar...',
    'search.noResults': 'Nenhum resultado encontrado',
    'search.errorFetching': 'Erro ao buscar resultados',
    'applicationLauncher.tooltip': 'Launcher de aplicações',
    'applicationLauncher.noLinksTitle': 'Nenhum link de aplicação configurado',
    'applicationLauncher.noLinksSubtitle':
      'Configure os links das aplicações na configuração do plugin dinâmico para acessar rapidamente por aqui.',
    'applicationLauncher.developerHub': 'Developer Hub',
    'applicationLauncher.rhdhLocal': 'RHDH Local',
    'applicationLauncher.sections.documentation': 'Documentação',
    'applicationLauncher.sections.developerTools': 'Ferramentas de desenvolvedor',
    'starred.title': 'Seus itens favoritos',
    'starred.removeTooltip': 'Remover da lista',
    'starred.noItemsTitle': 'Nenhum item favorito ainda',
    'starred.noItemsSubtitle':
      'Clique no ícone de estrela ao lado do nome de uma entidade para salvá-la aqui para acesso rápido.',
    'notifications.title': 'Notificações',
    'notifications.unsupportedDismissOption':
      'Opção de fechamento não suportada "{{option}}", atualmente suportadas "none", "session" ou "localstorage"!',
    'toggleTheme.title': 'Tema',
    'toggleTheme.tooltipLight': 'Alterar o tema para Light',
    'toggleTheme.tooltipDark': 'Alterar o tema para Dark',
      'create.title': 'Autosserviço',
    'create.registerComponent.title': 'Registrar um componente',
    'create.registerComponent.subtitle': 'Importe na página do catálogo',
    'create.templates.sectionTitle': 'Usar um template',
    'create.templates.allTemplates': 'Todos os templates',
    'create.templates.errorFetching': 'Erro ao buscar templates',
    'create.templates.noTemplatesAvailable': 'Nenhum template disponível',
  },
});

export default globalHeaderTranslationPt;
