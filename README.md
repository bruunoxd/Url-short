# URL Shortener Platform

Uma plataforma completa de encurtamento de URLs com recursos avançados de analytics, autenticação de usuários e arquitetura de microserviços.

## 🚀 Recursos

- **Encurtamento de URLs**: Transforme URLs longas em links curtos e fáceis de compartilhar
- **Analytics Avançado**: Rastreamento detalhado de cliques com métricas em tempo real
- **Autenticação de Usuários**: Sistema completo de registro, login e gerenciamento de usuários
- **Dashboard Interativo**: Interface moderna para gerenciar URLs e visualizar estatísticas
- **Arquitetura de Microserviços**: Escalável e modular
- **Cache Inteligente**: Redis para performance otimizada
- **Monitoramento**: Prometheus, Grafana e alertas integrados
- **Kubernetes Ready**: Configurações para deploy em produção

## 🏗️ Arquitetura

### Microserviços
- **URL Shortener Service**: Gerenciamento de URLs encurtadas
- **Analytics Service**: Processamento e análise de dados de cliques
- **User Management Service**: Autenticação e gerenciamento de usuários

### Tecnologias
- **Backend**: Node.js, TypeScript, Express
- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Bancos de Dados**: PostgreSQL, Redis, ClickHouse
- **Monitoramento**: Prometheus, Grafana
- **Orquestração**: Docker, Kubernetes
- **Gateway**: Kong API Gateway

## 🚀 Como Executar

### Desenvolvimento Local

```bash
# Clone o repositório
git clone https://github.com/bruunoxd/Url-short.git
cd Url-short

# Execute com Docker Compose
docker-compose up -d
```

### Acesso
- **Frontend**: http://localhost:3000
- **API Gateway**: http://localhost:8000
- **Grafana**: http://localhost:3001

### Desenvolvimento com Turbo

```bash
# Instale as dependências
npm install

# Execute todos os serviços em modo desenvolvimento
npm run dev

# Execute testes
npm run test

# Build para produção
npm run build
```

## 📊 Monitoramento

O projeto inclui dashboards completos do Grafana e alertas do Prometheus para:
- Performance de redirecionamentos
- Métricas de uso
- Saúde dos serviços
- Alertas de disponibilidade

## 🔧 Deploy em Produção

### Kubernetes

```bash
# Deploy dos serviços base
kubectl apply -f k8s/base/

# Deploy do monitoramento
kubectl apply -f k8s/monitoring/

# Deploy com Helm
helm install url-shortener k8s/helm/url-shortener/
```

### Scripts de Deploy

```bash
# Deploy automatizado
./scripts/deploy-production.sh

# Testes de fumaça
./scripts/run-smoke-tests.js

# Backup de bancos de dados
./scripts/backup-databases.sh
```

## 🧪 Testes

- **Testes Unitários**: Jest para todos os serviços
- **Testes de Integração**: APIs e banco de dados
- **Testes E2E**: Cypress para fluxos de usuário
- **Testes de Carga**: Artillery para performance
- **Testes de Caos**: Resilência da aplicação

```bash
# Executar todos os testes
npm run test:all

# Testes de performance
npm run test:performance

# Testes de carga
npm run test:load
```

## 📁 Estrutura do Projeto

```
├── frontend/                 # Next.js frontend
├── services/                # Microserviços
│   ├── url-shortener/       # Serviço de encurtamento
│   ├── analytics/           # Serviço de analytics
│   └── user-management/     # Gerenciamento de usuários
├── packages/                # Pacotes compartilhados
│   ├── shared-db/          # Modelos e conexões de BD
│   ├── shared-monitoring/   # Monitoramento compartilhado
│   └── shared-rate-limiter/ # Rate limiting
├── k8s/                     # Configurações Kubernetes
├── docker/                  # Configurações Docker
├── scripts/                 # Scripts de automação
└── tests/                   # Testes E2E e de carga
```

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📝 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

