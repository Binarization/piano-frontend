import { createI18n } from 'vue-i18n'
import en from './locales/en.json'
import zh from './locales/zh.json'

const i18n = createI18n({
  legacy: false, // Use Composition API
  locale: localStorage.getItem('user_locale') || (navigator.language.startsWith('zh') ? 'zh' : 'en'), // default locale from system or saved
  fallbackLocale: 'en',
  messages: {
    en,
    zh
  }
})

export default i18n
