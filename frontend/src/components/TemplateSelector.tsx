/**
 * TemplateSelector – Vorlagen-Auswahl für die Seitenerstellung
 *
 * Modal, das beim Erstellen einer neuen Seite die verfügbaren Vorlagen zeigt.
 */

import { useState, useEffect } from 'react';
import { FileText, X, Check, Sparkles } from 'lucide-react';
import { api, type PageTemplate } from '../api/client';
import { useLanguage } from '../context/LanguageContext';

interface TemplateSelectorProps {
  onSelect: (template: PageTemplate | null) => void;
  onClose: () => void;
}

export default function TemplateSelector({ onSelect, onClose }: TemplateSelectorProps) {
  const { t } = useLanguage();
  const [templates, setTemplates] = useState<PageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    api.getTemplates()
      .then(setTemplates)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleConfirm = () => {
    if (selectedId) {
      const tpl = templates.find(t => t.id === selectedId);
      onSelect(tpl || null);
    } else {
      onSelect(null);
    }
  };

  // Group by category
  const categories = [...new Set(templates.map(t => t.category))];

  const categoryLabels: Record<string, string> = {
    general: t('templates.cat_general'),
    meetings: t('templates.cat_meetings'),
    documentation: t('templates.cat_documentation'),
    guides: t('templates.cat_guides'),
    decisions: t('templates.cat_decisions'),
  };

  return (
    <div className="template-modal-overlay" onClick={onClose}>
      <div className="template-modal" onClick={e => e.stopPropagation()}>
        <div className="template-modal-header">
          <div className="template-modal-title">
            <Sparkles size={20} />
            <span>{t('templates.title')}</span>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <p className="template-modal-desc">{t('templates.description')}</p>

        {loading ? (
          <div className="template-loading">{t('common.loading')}</div>
        ) : (
          <div className="template-grid">
            {/* Blank page option */}
            <button
              className={`template-card ${selectedId === null ? 'selected' : ''}`}
              onClick={() => setSelectedId(null)}
            >
              <div className="template-card-icon">📄</div>
              <div className="template-card-info">
                <span className="template-card-name">{t('templates.blank')}</span>
                <span className="template-card-desc">{t('templates.blank_desc')}</span>
              </div>
              {selectedId === null && <Check size={16} className="template-card-check" />}
            </button>

            {categories.map(category => (
              templates
                .filter(tpl => tpl.category === category)
                .map(tpl => (
                  <button
                    key={tpl.id}
                    className={`template-card ${selectedId === tpl.id ? 'selected' : ''}`}
                    onClick={() => setSelectedId(tpl.id)}
                  >
                    <div className="template-card-icon">{tpl.icon}</div>
                    <div className="template-card-info">
                      <span className="template-card-name">{tpl.name}</span>
                      <span className="template-card-desc">{tpl.description}</span>
                    </div>
                    {selectedId === tpl.id && <Check size={16} className="template-card-check" />}
                  </button>
                ))
            ))}
          </div>
        )}

        <div className="template-modal-actions">
          <button className="btn btn-primary" onClick={handleConfirm}>
            <FileText size={15} />
            {selectedId ? t('templates.use') : t('templates.start_blank')}
          </button>
          <button className="btn btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>
  );
}
