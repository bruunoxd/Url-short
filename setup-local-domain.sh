#!/bin/bash

echo "🔧 Configurando domínio local personalizado..."

# Verificar se é macOS ou Linux
if [[ "$OSTYPE" == "darwin"* ]]; then
    HOSTS_FILE="/etc/hosts"
    echo "Detectado: macOS"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    HOSTS_FILE="/etc/hosts"
    echo "Detectado: Linux"
else
    echo "❌ Sistema operacional não suportado"
    exit 1
fi

# Domínio personalizado
DOMAIN="short.local"

# Verificar se o domínio já existe no arquivo hosts
if grep -q "$DOMAIN" "$HOSTS_FILE"; then
    echo "✅ Domínio $DOMAIN já está configurado"
else
    echo "📝 Adicionando $DOMAIN ao arquivo hosts..."
    echo "127.0.0.1 $DOMAIN" | sudo tee -a "$HOSTS_FILE"
    echo "✅ Domínio $DOMAIN adicionado com sucesso!"
fi

echo ""
echo "🎉 Configuração concluída!"
echo ""
echo "Agora você pode acessar:"
echo "• Interface: http://short.local:3000"
echo "• Links encurtados: http://short.local:3000/codigo"
echo ""
echo "Para testar:"
echo "1. Acesse http://short.local:3000"
echo "2. Encurte uma URL"
echo "3. O link gerado será: http://short.local:3000/codigo"
echo "4. Clique no link - vai redirecionar!"