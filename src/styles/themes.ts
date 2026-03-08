export type ThemeId = 'pink' | 'mint' | 'violet' | 'caramel';

export interface Theme {
  id: ThemeId;
  label: string;
  vars: Record<string, string>;
}

export const themes: Theme[] = [
  {
    id: 'pink',
    label: '🌸 Ružová',
    vars: {
      '--color-primary':        '#e0457b',
      '--color-primary-light':  '#ff9fc4',
      '--color-primary-bg':     '#fff0f5',
      '--color-primary-border': '#ffd6e7',
    },
  },
  {
    id: 'mint',
    label: '🌿 Mentolová',
    vars: {
      '--color-primary':        '#2a9d8f',
      '--color-primary-light':  '#52b788',
      '--color-primary-bg':     '#f0faf7',
      '--color-primary-border': '#b7e4c7',
    },
  },
  {
    id: 'violet',
    label: '💜 Fialová',
    vars: {
      '--color-primary':        '#7c3aed',
      '--color-primary-light':  '#a78bfa',
      '--color-primary-bg':     '#f5f3ff',
      '--color-primary-border': '#ddd6fe',
    },
  },
  {
    id: 'caramel',
    label: '🍯 Karamelová',
    vars: {
      '--color-primary':        '#b45309',
      '--color-primary-light':  '#f59e0b',
      '--color-primary-bg':     '#fffbeb',
      '--color-primary-border': '#fde68a',
    },
  },
];
