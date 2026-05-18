// Minimal i18n helper. German is the default and only fully-populated locale.
// Add new locales by adding a key to STRINGS. Components should import { t }
// and call t('admin.rag.contextual.title') instead of hardcoding strings.
//
// Existing hardcoded German in older components is not a regression to chase,
// but every new user-facing string must go through here.

const STRINGS = {
  de: {
    'admin.rag.section.context_assembly': 'Kontextzusammenstellung',
    'admin.rag.neighbor.label': 'Nachbar-Chunks aktiviert',
    'admin.rag.neighbor.hint':
      'Ergänzt ±1 Nachbar-Chunk für die Top-3-Treffer (verbessert Kontext an Chunk-Grenzen)',
    'admin.rag.max_tokens.label': 'Max. Kontext-Token',
    'admin.rag.max_tokens.hint': 'Token-Budget für RAG-Kontext im Prompt (Standard: 6000)',

    'admin.rag.section.contextual_retrieval': 'Kontextuelles Retrieval',
    'admin.rag.contextual.description':
      'Stellt jedem Chunk beim Upload einen LLM-generierten Kontextsatz voran. ' +
      'Verbessert die Abrufqualität erheblich, verursacht aber zusätzliche LLM-Kosten beim Hochladen. ' +
      'Nur für neu hochgeladene Dokumente aktiv — bestehende Dokumente müssen neu gechunkt werden.',
    'admin.rag.contextual.enabled.label': 'Kontextuelles Retrieval aktiviert',
    'admin.rag.contextual.model.label': 'Modell für Kontextgenerierung',
    'admin.rag.contextual.model.hint':
      'Günstigstes verfügbares Modell empfohlen (z.B. Haiku, Mistral-Small)',

    'pool.header.count.chats': 'Chats',
    'pool.header.count.docs': 'Dokumente',
    'pool.header.count.members': 'Mitglieder',
    'pool.header.role.admin': 'Administrator:in',
    'pool.header.role.editor': 'Bearbeiter:in',
    'pool.header.role.owner': 'Eigentümer:in',
    'pool.header.role.viewer': 'Betrachter:in',
    'pool.overview.chat.message_count': 'Nachrichten',
    'pool.overview.chat.private': 'Privat',
    'pool.overview.chat.shared': 'Geteilt',
    'pool.overview.no_chats': 'Noch keine Chats',
    'pool.overview.no_documents': 'Noch keine Dokumente',
    'pool.overview.no_members': 'Noch keine Mitglieder',
    'pool.overview.see_all': 'Alle anzeigen',
    'pool.overview.section.chats': 'Chats',
    'pool.overview.section.documents': 'Dokumente',
    'pool.overview.section.members': 'Mitglieder',
    'pool.overview.section.summary': 'Übersicht',
    'pool.overview.summary.docs': 'Dokumente',
    'pool.overview.summary.chats_count': 'Chats',
    'pool.overview.summary.members_count': 'Mitglieder',
    'pool.tag.prefix': 'Pool: ',
    'pool.tab.overview': 'Übersicht',
    'pool.chat.button.shared': 'Geteilter Chat',
    'pool.chat.button.private': 'Privater Chat',
    'pool.chat.section.shared': 'Geteilte Chats',
    'pool.chat.section.private': 'Meine privaten Chats',
    'pool.chat.empty': 'Noch keine Chats. Erstelle einen geteilten oder privaten Chat.',

    'doc.status.processing': 'Wird verarbeitet',
    'doc.status.processing.long':
      'OCR und Indexierung laufen — der Inhalt ist gleich verfügbar',
    'doc.action.delete': 'Dokument löschen',
    'doc.chunks': 'Chunks',

    // ── Navigation ──
    'nav.bilder.label': 'Bilder',

    // ── Bilder-Tab ──
    'bilder.heading': 'Bilder generieren',
    'bilder.form.prompt.label': 'Prompt',
    'bilder.form.prompt.placeholder': 'Beschreibe das gewünschte Bild...',
    'bilder.form.prompt.hint': 'max. 2000 Zeichen, empfohlen unter 1500',
    'bilder.form.model.label': 'Modell',
    'bilder.form.model.placeholder': 'Modell wählen...',
    'bilder.form.no_models': 'Kein Bildmodell konfiguriert — bitte Admin kontaktieren',
    'bilder.button.generate': 'Generieren',
    'bilder.button.cancel': 'Verstecken',
    'bilder.status.generating': 'Wird generiert...',
    'bilder.status.backgrounded': 'Bild wird im Hintergrund fertig generiert. Du findest es gleich in der Galerie.',
    'bilder.gallery.empty': 'Noch keine generierten Bilder',
    'bilder.image.download': 'Herunterladen',
    'bilder.image.copy_prompt': 'Prompt kopieren',
    'bilder.image.delete': 'Löschen',
    'bilder.image.delete.confirm.title': 'Bild löschen?',
    'bilder.image.delete.confirm.message': 'Diese Aktion kann nicht rückgängig gemacht werden.',
    'bilder.image.preview.title': 'Bildvorschau',
    'bilder.budget.limit': 'Tageslimit',
    'bilder.budget.remaining': 'verbleibend',
    'bilder.gallery.loading': 'Laden...',
    'bilder.gallery.load_more': 'Mehr laden',
    'bilder.image.created_label': 'Erstellt',

    // ── Chat image strings (dormant in v1; used by MessageBubble image branch, restored in v2) ──
    'chat.image.placeholder': 'Bild wird generiert...',
    'chat.image.unavailable': 'Bild nicht mehr verfügbar — bitte neu generieren',
    'chat.image.regenerate': 'Erneut generieren',

    // ── Admin: renamed Chatmodelle tab ──
    'admin.chatmodelle.tab.label': 'Chatmodelle',

    // ── Admin: Bildmodelle tab ──
    'admin.bildmodelle.tab.label': 'Bildmodelle',
    'admin.bildmodelle.heading': 'Bildmodelle verwalten',
    'admin.bildmodelle.column.provider': 'Provider',
    'admin.bildmodelle.column.model_id': 'Modell-ID',
    'admin.bildmodelle.column.cost_per_image': 'Kosten pro Bild (USD)',
    'admin.bildmodelle.column.default': 'Standard',
    'admin.bildmodelle.action.set_default': 'Als Standard setzen',
    'admin.bildmodelle.empty': 'Noch keine Bildmodelle konfiguriert',
    'admin.bildmodelle.add.button': 'Modell hinzufügen',
    'admin.bildmodelle.add.success': 'Bildmodell hinzugefügt',
    'admin.bildmodelle.delete.success': 'Bildmodell gelöscht',

    // ── Admin: Bild-Stil tab ──
    'admin.bild_stil.tab.label': 'Bild-Stil',
    'admin.bild_stil.heading': 'Globaler Bild-Stil-Präfix',
    'admin.bild_stil.hint': 'Wird unsichtbar vor jedem Prompt eingefügt. Maximal 1000 Zeichen.',
    'admin.bild_stil.field.name': 'Name',
    'admin.bild_stil.field.prefix': 'Stil-Präfix',
    'admin.bild_stil.field.active': 'Aktiv',

    // ── Admin: Kosten — Bild section ──
    'admin.kosten.bild.heading': 'Bild-Kosten',
    'admin.kosten.bild.total': 'Gesamt Bilder-Kosten',
    'admin.kosten.bild.per_user': 'Pro Nutzer',
    'admin.kosten.bild.per_model': 'Pro Modell',
  },
  en: {
    // Placeholder for future English translations. Until populated, t() falls
    // back to the German string for any missing key.
  },
}

let currentLocale = 'de'

export function setLocale(locale) {
  if (STRINGS[locale]) currentLocale = locale
}

export function getLocale() {
  return currentLocale
}

export function t(key) {
  const localeStrings = STRINGS[currentLocale] || {}
  if (key in localeStrings) return localeStrings[key]
  const fallback = STRINGS.de[key]
  if (fallback !== undefined) return fallback
  return key
}
