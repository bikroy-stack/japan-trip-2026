# 🗾 Japon 2026 — Itinéraire famille

Site web de l'itinéraire partagé — powered by GitHub Pages.

**👉 [Voir le site](https://bikroy-stack.github.io/japan-trip-2026/)**

## Mettre à jour l'itinéraire

1. Éditer `japon_itineraire_2026.md`
2. `git add japon_itineraire_2026.md && git commit -m "votre message" && git push`
3. Le site se met à jour automatiquement en ~60 secondes

## Ce que tu peux modifier dans le MD

- ✅ Horaires et descriptions des activités
- ✅ Temps et coûts de transport
- ✅ Conseils (lignes > blockquote)
- ✅ Statuts de la checklist (✅/⚠️/ℹ️)
- ✅ Détails des vols et tableaux de transport
- ✅ Coordonnées dans le tableau `## 📍 Coordonnées`

## Conventions MD attendues par le parser

| Élément | Format attendu |
|---------|---------------|
| En-tête ville | `## 🌟 CITY NAME — dates` |
| En-tête jour | `### Jour N — Weekday DD month : Titre` |
| Conseil | `> texte` (blockquote après l'en-tête de jour) |
| Ligne transport | Colonne Heure = `—` |
| Vol confirmé | Première colonne = `✅` |
| Marqueur carte | Tableau `## 📍 Coordonnées` |

## Mise en route (première fois)

```bash
# Cloner et installer
git clone https://github.com/bikroy-stack/japan-trip-2026.git
cd japan-trip-2026

# Activer GitHub Pages
# Settings → Pages → Source: GitHub Actions
# Pousser pour déclencher le premier déploiement
git push
```
