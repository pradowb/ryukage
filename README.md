# Ryukage — Estúdio de Sites

Site institucional da Ryukage, estúdio que desenha e constrói sites autorais para pequenos negócios.

**Ver online:** https://ryukage.com

![Página inicial da Ryukage](screenshot.jpg)

## Tecnologias

- HTML, CSS e JavaScript puro (sem framework)
- Animações próprias (campo de estrelas e figura 3D na hero)
- SEO básico: `sitemap.xml`, `robots.txt` e imagem Open Graph
- Publicado em Cloudflare Workers

## Correr localmente

```bash
python3 -m http.server 8080
```

Depois abra http://localhost:8080.

## Publicar

```bash
npx wrangler deploy
```
