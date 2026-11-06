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

É necessário ter o `yt-dlp` instalado. A mesclagem de formatos e a conversão de áudio podem exigir o FFmpeg. A pasta de destino precisa existir. Consulte a [instalação oficial do yt-dlp](https://github.com/yt-dlp/yt-dlp#installation).

Baixe somente conteúdos que você criou ou para os quais tem autorização, respeitando os direitos autorais e os termos da plataforma.
