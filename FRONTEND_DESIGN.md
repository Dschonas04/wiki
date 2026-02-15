# Frontend Design - Outline-Inspired UI

## Overview

The wiki application now features a modern, clean interface inspired by [Outline](https://www.getoutline.com/), a popular knowledge base platform. The design emphasizes readability, usability, and a professional appearance.

## Key Design Features

### 1. **Sidebar Navigation**
- Fixed sidebar on the left (260px width)
- Clean logo area at the top
- Organized navigation with clear sections
- Active state highlighting with the primary color
- Hover effects for better interactivity

### 2. **Color Scheme**
- **Primary Color**: #4E5AEE (vibrant blue-purple)
- **Text Colors**: Multiple shades of gray for hierarchy
  - Primary text: #1F2937 (dark gray)
  - Secondary text: #6B7280 (medium gray)
  - Tertiary text: #9CA3AF (light gray)
- **Backgrounds**: Subtle grays and whites
  - Main background: #FFFFFF
  - Secondary background: #F9FAFB
  - Sidebar background: #FAFBFC

### 3. **Typography**
- System font stack for optimal readability:
  - -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', etc.
- Font sizes optimized for hierarchy:
  - Page titles: 32px
  - Section headers: 20px
  - Body text: 15px
- Anti-aliased rendering for smooth text

### 4. **Layout Structure**
```
┌─────────────┬──────────────────────────────────┐
│   Sidebar   │      Content Header              │
│   (Fixed)   │      (Sticky)                    │
│             ├──────────────────────────────────┤
│   • Home    │                                  │
│   • Pages   │      Content Body                │
│   • Health  │      (Scrollable)                │
│             │                                  │
└─────────────┴──────────────────────────────────┘
```

### 5. **Components**

#### Cards
- Subtle borders and shadows
- Hover effects for interactivity
- Rounded corners (8px radius)
- Special gradient card for featured content

#### Forms
- Clean input fields with focus states
- Primary color highlights on focus
- Generous padding for touch-friendly design
- Validation feedback

#### Buttons
- Primary button: Bold color with hover effects
- Secondary button: Outlined style
- Icon + text combinations
- Smooth transitions and hover states

#### Page Cards
- Grid layout for pages
- Preview of page content (3 lines max)
- Metadata display (date, character count)
- Hover effects with elevation

### 6. **Responsive Design**
- Mobile-friendly layout
- Sidebar transforms off-screen on mobile
- Content adapts to smaller screens
- Touch-friendly tap targets

## Page Designs

### Home Page
- Welcome message in gradient card
- Quick action buttons
- Information about the wiki
- Clean, inviting layout

### Pages List
- Form for creating new pages
- Grid of existing pages
- Empty state for when no pages exist
- Metadata for each page

### Health Check
- System status badges
- Health metrics in card grid
- Database configuration details
- API endpoint documentation

## Technical Implementation

### CSS Architecture
- CSS Custom Properties (variables) for theming
- Mobile-first responsive approach
- Flexbox and Grid for layouts
- Smooth animations and transitions

### File Structure
```
/public
  └── style.css    (8KB of modern CSS)
```

### Server Integration
- Static file serving with Express
- CSS file served from `/public` directory
- HTML templates include stylesheet link
- Consistent navigation across all pages

## Design Principles

1. **Minimalism**: Clean, uncluttered interface
2. **Consistency**: Uniform design patterns throughout
3. **Hierarchy**: Clear visual hierarchy for content
4. **Accessibility**: Readable fonts and sufficient contrast
5. **Performance**: Lightweight CSS with no dependencies
6. **Maintainability**: CSS variables for easy theming

## Browser Compatibility

The design uses modern CSS features but maintains broad compatibility:
- CSS Grid and Flexbox
- CSS Custom Properties
- Smooth scrolling
- Modern font rendering
- Works in all modern browsers (Chrome, Firefox, Safari, Edge)

## Future Enhancements

Potential improvements:
- Dark mode theme
- User customizable colors
- Search functionality in sidebar
- Breadcrumb navigation
- Markdown rendering for page content
- Rich text editor
- Page categories and tags

## Comparison to Basic Design

### Before (Basic Design)
- Simple HTML with inline styles
- Basic navigation links
- Minimal styling
- No sidebar
- Limited visual hierarchy

### After (Outline-inspired Design)
- Modern, professional appearance
- Fixed sidebar navigation
- Rich visual hierarchy
- Gradient accents
- Card-based layouts
- Smooth animations
- Responsive design
- Professional color scheme

## Screenshots

To see the new design in action, start the application with Docker Compose:

```bash
docker compose up -d
```

Then visit:
- http://localhost:8080 - Home page
- http://localhost:8080/pages - Pages list
- http://localhost:8080/health - System health

The new interface provides a significantly improved user experience with a modern, professional look that makes the wiki application feel polished and ready for team use.
