# Deploy no VPS — subdomínio por barbearia

Este diretório reúne o que falta para sair do plano compartilhado (Hostinger
Business, onde o Passenger cuidava de tudo) para um VPS, especificamente para
destravar **subdomínio por barbearia** — o requisito que o plano compartilhado
não atendia por falta de wildcard SSL.

O código do app **não muda** para isto: `src/middlewares/tenant.js` já resolve
barbearia por subdomínio, e `src/config/paths.js` já protege banco/uploads
fora da pasta de deploy. O que falta é infraestrutura em volta dele.

## Passo a passo

### 1. DNS — wildcard apontando para o VPS

No provedor de DNS (Hostinger ou, se a API dele não for suportada pelo
certbot, migre o DNS para o Cloudflare — é grátis e o plugin é trivial):

```
A     cortavo.com.br         IP_DO_VPS
A     *.cortavo.com.br       IP_DO_VPS
```

O `*` é o que faz qualquer slug novo (`barbeariax.cortavo.com.br`) já
funcionar assim que a barbearia for criada no painel-mestre — sem voltar
aqui para configurar DNS de novo.

### 2. Certbot — wildcard SSL via DNS-01

Certificado wildcard **exige** o desafio DNS-01 (o HTTP-01 comum não cobre
`*.dominio`). Se o DNS estiver na Hostinger, confirme primeiro se
`certbot-dns-hostinger` (ou equivalente) existe e funciona; senão, mova o DNS
para Cloudflare e use `certbot-dns-cloudflare`.

Exemplo com Cloudflare:

```bash
sudo apt install certbot python3-certbot-dns-cloudflare
sudo certbot certonly --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
  -d cortavo.com.br -d '*.cortavo.com.br'
```

Isso cria `/etc/letsencrypt/live/cortavo.com.br/`, que é o caminho que
`nginx-cortavo.conf` espera. Configure a renovação automática (o certbot já
instala um timer/cron próprio na maioria das distros — confirme com
`sudo certbot renew --dry-run`).

### 3. Nginx

Ver `nginx-cortavo.conf` — o arquivo já está comentado com os passos de
instalação. Resumo: ele termina o SSL e repassa **qualquer** host (raiz ou
subdomínio) para o Node na porta 3000, preservando o cabeçalho `Host` — é dele
que `tenant.js` extrai o slug.

### 4. systemd — manter o app no ar

Ver `cortavo.service`. Sem o Passenger, alguém precisa reiniciar o app se ele
cair ou se o servidor reiniciar; é para isso que serve.

```bash
sudo cp deploy/cortavo.service /etc/systemd/system/cortavo.service
# edite WorkingDirectory, User e as variáveis de ambiente no arquivo
sudo systemctl daemon-reload
sudo systemctl enable --now cortavo
sudo systemctl status cortavo
```

Depois de cada deploy (`git pull && npm install`):

```bash
sudo systemctl restart cortavo
```

### 5. Backup diário

Ver `backup.sh`. No compartilhado a hospedagem gerenciada dava alguma rede de
proteção; no VPS isso é seu. O script usa `sqlite3 .backup` (cópia
consistente mesmo com o app rodando), compacta banco + uploads, e apaga
backups com mais de 14 dias. Instale no cron conforme o comentário no fim do
arquivo — e idealmente descomente o envio para fora do servidor (rclone/scp),
porque um backup que mora no mesmo disco do banco não sobrevive a uma falha
de disco.

## Variáveis de ambiente em produção

As mesmas de sempre (`src/config/paths.js` já valida e recusa subir se
estiverem erradas):

```
NODE_ENV=production
APP_DOMAIN=cortavo.com.br
APP_DATA_DIR=/home/cortavo/cortavo-data
DATABASE_URL=file:/home/cortavo/cortavo-data/app.db
SESSION_SECRET=<gerar um valor aleatório novo>
```

`APP_DOMAIN` é o que permite `tenant.js` diferenciar
`barbeariax.cortavo.com.br` (subdomínio de barbearia) de `cortavo.com.br`
(domínio raiz, sem barbearia) — sem essa variável o middleware cai numa
heurística menos confiável.

## O que NÃO muda

- SQLite continua sendo o banco — é um arquivo, não um serviço à parte.
- Uploads continuam em disco, dentro de `APP_DATA_DIR`.
- Migrations e seed continuam rodando no `postinstall` (`npm install` já
  dispara `prisma migrate deploy`).
- Criar uma barbearia continua sendo feito no painel-mestre — só que agora o
  subdomínio dela funciona sozinho, sem passo manual extra.

## Pendência separada (não é infraestrutura)

O e-mail de login é único **por barbearia**, não globalmente. Com o
subdomínio funcionando isso deixa de ser risco — cada barbearia autentica
isolada dentro do próprio subdomínio — mas vale confirmar antes de o segundo
cliente começar a usar em produção.
