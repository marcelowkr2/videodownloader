# yt-dlp comando

Aplicação web que monta comandos `yt-dlp` para o terminal do Linux. O link e as opções ficam no navegador; a aplicação não baixa nem envia vídeos.

## Executar localmente

Requer Node.js 18 ou superior.

```bash
npm install
npm run dev
```

Abra no navegador o endereço local indicado pelo Vite. Para gerar os arquivos de produção:

```bash
npm run build
```

## Usar

1. Cole um link de vídeo, Short ou `youtu.be`.
2. Escolha vídeo ou áudio, formato, resolução e pasta de destino.
3. Copie o comando gerado e execute-o no terminal.

## Botão "Baixar agora" e agente local

O YouTube costuma bloquear downloads feitos a partir de servidores (VPS). Por isso o botão usa, de preferência, um **agente local** que roda o `yt-dlp` no seu computador (Linux) e salva na pasta escolhida. Instale uma vez, sem sudo:

```bash
curl -fsSL https://videodownloader.infosystema.cloud/agent/install.sh | bash
```

O agente roda como serviço de usuário (`systemctl --user status yt-dlp-agent`), escuta só em `127.0.0.1:47890`, aceita pedidos apenas do site e grava somente dentro da sua pasta pessoal (pastas ocultas são recusadas). Se não estiver instalado, o site tenta baixar pelo servidor. Para remover:

```bash
systemctl --user disable --now yt-dlp-agent && rm -rf ~/.local/share/yt-dlp-agent ~/.config/systemd/user/yt-dlp-agent.service
```

O código está em [public/agent/](public/agent).

É necessário ter o `yt-dlp` instalado. A mesclagem de formatos e a conversão de áudio podem exigir o FFmpeg. A pasta de destino precisa existir. Consulte a [instalação oficial do yt-dlp](https://github.com/yt-dlp/yt-dlp#installation).

Para MP4, a aplicação seleciona vídeo H.264 e áudio AAC para maior compatibilidade com reprodutores. A resolução máxima disponível pode ser menor que a escolhida; se esses codecs não estiverem disponíveis, tente MKV. O parâmetro `index` de um link não altera o vídeo baixado quando a opção de playlist está desmarcada.

Baixe somente conteúdos que você criou ou para os quais tem autorização, respeitando os direitos autorais e os termos da plataforma.
