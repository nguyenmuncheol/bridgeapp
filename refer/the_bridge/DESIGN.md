---
name: The Bridge
colors:
  surface: '#f7f9ff'
  surface-dim: '#d7dae0'
  surface-bright: '#f7f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f4fa'
  surface-container: '#ebeef4'
  surface-container-high: '#e5e8ef'
  surface-container-highest: '#e0e2e9'
  on-surface: '#181c21'
  on-surface-variant: '#42474e'
  inverse-surface: '#2d3136'
  inverse-on-surface: '#eef1f7'
  outline: '#72777f'
  outline-variant: '#c2c7cf'
  surface-tint: '#366289'
  primary: '#335f87'
  on-primary: '#ffffff'
  primary-container: '#4e78a1'
  on-primary-container: '#fdfcff'
  inverse-primary: '#a0caf8'
  secondary: '#914c24'
  on-secondary: '#ffffff'
  secondary-container: '#fda374'
  on-secondary-container: '#763710'
  tertiary: '#7a5513'
  on-tertiary: '#ffffff'
  tertiary-container: '#966d2a'
  on-tertiary-container: '#fffbff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#cfe5ff'
  primary-fixed-dim: '#a0caf8'
  on-primary-fixed: '#001d34'
  on-primary-fixed-variant: '#1a4a70'
  secondary-fixed: '#ffdbcb'
  secondary-fixed-dim: '#ffb691'
  on-secondary-fixed: '#341100'
  on-secondary-fixed-variant: '#73350e'
  tertiary-fixed: '#ffddb0'
  tertiary-fixed-dim: '#f1be73'
  on-tertiary-fixed: '#291800'
  on-tertiary-fixed-variant: '#614000'
  background: '#f7f9ff'
  on-background: '#181c21'
  surface-variant: '#e0e2e9'
typography:
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Be Vietnam Pro
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
  body-md:
    fontFamily: Be Vietnam Pro
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-sm:
    fontFamily: Be Vietnam Pro
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-md:
    fontFamily: Be Vietnam Pro
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 32px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  container-padding: 20px
  gutter: 16px
  stack-sm: 8px
  stack-md: 16px
  stack-lg: 32px
  max-width: 480px
---

## Brand & Style
The design system for this community-focused application prioritizes warmth, accessibility, and human connection. It utilizes a **Modern-Humanist** style, blending the cleanliness of modern SaaS with the soft, tactile elements of lifestyle apps. 

The aesthetic is characterized by generous whitespace, soft edges, and a sense of "breathability" to ensure the user feels welcomed and at peace. It avoids aggressive visual cues, favoring subtle transitions and high-legibility layouts that serve a multi-generational audience. The UI should evoke a sense of digital sanctuary—calm, organized, and inviting.

## Colors
The palette is grounded in a **Soft Blue** primary tone, chosen to represent stability and peace. A **Warm Orange** accent color is used sparingly to highlight community-driven actions like "Join" or "Give," injecting energy and heat into the interface.

- **Primary (#5D87B1):** Used for navigation, primary buttons, and branding elements.
- **Secondary/Accent (#E89264):** Used for micro-interactions, active status indicators, and call-to-action highlights.
- **Neutral (Grays):** A range of soft grays (from #F9FAFB for backgrounds to #2D3136 for text) ensures high contrast without the harshness of pure black-on-white.
- **Success/Warning:** Use muted versions of green and red to maintain the "soft" brand character.

## Typography
This design system uses **Plus Jakarta Sans** for headlines to provide a friendly, modern, and slightly rounded geometric feel. **Be Vietnam Pro** is utilized for body text and labels due to its exceptional legibility and warm, contemporary character.

Maintain a vertical rhythm by ensuring line heights are generous—this improves accessibility for older congregation members. Headlines should use a slight negative letter-spacing to appear more cohesive, while labels (all-caps or small caps) benefit from slight tracking to improve scannability.

## Layout & Spacing
The layout follows a **Mobile-First** philosophy, centered on a single-column flow optimized for a maximum width of 480px. On larger screens, the container should be centered with a soft background wash to maintain the intimacy of a handheld experience.

- **Grid:** A 4-column fluid grid for mobile, expanding to a 6-column grid within the 480px container.
- **Margins:** 20px safe-area margins on the left and right of the screen.
- **Rhythm:** Use a 4px base scaling system (4, 8, 16, 24, 32, 48, 64) for all padding and margins to ensure visual harmony.
- **Verticality:** Use "Stack" components to maintain consistent 16px or 32px gaps between content blocks like "Upcoming Events" or "Daily Verse."

## Elevation & Depth
Depth is created through **Tonal Layering** and **Ambient Shadows**. Instead of heavy borders, surfaces use subtle shifts in background color to denote hierarchy.

- **Level 0 (Background):** The base color (#F9FAFB).
- **Level 1 (Cards/Inputs):** White (#FFFFFF) with a very soft, diffused shadow: `0px 4px 12px rgba(93, 135, 177, 0.08)`. Note the subtle blue tint in the shadow to maintain color harmony.
- **Level 2 (Modals/Popovers):** White (#FFFFFF) with a more pronounced shadow: `0px 8px 24px rgba(0, 0, 0, 0.1)`.
- **Micro-interactions:** Use Framer Motion for elevation changes. On press, cards should slightly scale down (0.98) and shadows should diminish to simulate a physical "press" into the surface.

## Shapes
The shape language is defined by **large radii** to evoke friendliness and safety. 
- **Standard UI Elements:** (Buttons, Input Fields) use a 0.5rem (8px) radius.
- **Content Containers:** (Cards, Modals) use `rounded-xl` (1.5rem / 24px) to create a distinct, soft container look.
- **Interactive Indicators:** (Chips, Avatars) are fully rounded (pill-shaped) to distinguish them from structural elements.

## Components
- **Buttons:** Primary buttons use the Soft Blue background with white text. They should have a minimum height of 48px for touch accessibility. Secondary buttons use a ghost style with a 1px Soft Blue border.
- **Cards:** White backgrounds with 24px rounded corners. Cards should include 16px of internal padding. Use for "Event Highlights," "Prayer Requests," and "Sermon Series."
- **Input Fields:** Soft gray background (#F3F4F6) with no border in its default state, transitioning to a Soft Blue border on focus. 
- **Chips:** Small, pill-shaped tags used for categorizing events (e.g., "Youth," "Small Group," "Service"). Use a light tint of the Primary color (10% opacity) with Primary colored text.
- **Icons:** Use **Lucide-React** icons with a 2px stroke weight. Icons should be paired with text labels wherever possible to ensure clarity for all age groups.
- **Micro-interactions:** 
  - Page transitions: Subtle fade and vertical slide (y: 10 to 0).
  - Checkboxes/Radios: Spring-based "pop" animation when toggled.
  - Lists: Staggered entrance animations for list items to make the content feel "alive."