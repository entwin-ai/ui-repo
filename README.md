# Entwin - Your Personal AI Concierge

A modern, responsive homepage for Entwin, built with Next.js and TypeScript.

## Features

- 🤖 AI Concierge Service
- 📅 Smart Scheduling & Email Automation
- 🎯 Priority Management
- 🛡️ Enterprise Privacy & Security
- 💎 Premium Design with Light Turquoise Theme
- 📱 Fully Responsive (Mobile, Tablet, Desktop)

## Project Structure

```
entwin/
├── app/
│   ├── components/
│   │   ├── Navigation.tsx
│   │   ├── Hero.tsx
│   │   ├── Features.tsx
│   │   ├── ValueProposition.tsx
│   │   ├── Privacy.tsx
│   │   ├── Pricing.tsx
│   │   ├── CTA.tsx
│   │   ├── Footer.tsx
│   │   └── *.module.css
│   ├── globals.css
│   ├── layout.tsx
│   └── page.tsx
├── package.json
├── tsconfig.json
├── next.config.js
└── .gitignore
```

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Clone the repository:
```bash
cd entwin
```

2. Install dependencies:
```bash
npm install
# or
yarn install
```

3. Run the development server:
```bash
npm run dev
# or
yarn dev
```

4. Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Build for Production

```bash
npm run build
npm run start
```

## Color Scheme

- **Primary Turquoise**: #20B2AA
- **Light Turquoise**: #E0F7F6
- **Dark Turquoise**: #0D9488
- **Text Dark**: #1F2937
- **Text Light**: #6B7280

## Key Sections

- **Navigation**: Sticky header with smooth navigation links
- **Hero**: Eye-catching headline with CTA buttons
- **Features**: 6 powerful features in a responsive grid
- **Value Proposition**: Benefits for high-net-worth professionals
- **Privacy**: Enterprise-grade security messaging
- **Pricing**: $1,000/month professional plan
- **CTA**: Final call-to-action section
- **Footer**: Multi-column footer with links

## Customization

All styling is done with CSS Modules, making it easy to customize:
- Edit `app/components/*.module.css` for component styles
- Edit `app/globals.css` for global styles
- Update color variables in CSS files

## Deployment

This project can be deployed on:
- Vercel (recommended for Next.js)
- Netlify
- AWS Amplify
- Any Node.js hosting provider

## License

All rights reserved © 2026 Entwin
