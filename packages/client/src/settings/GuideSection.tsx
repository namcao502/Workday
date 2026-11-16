import { Button } from '@heroui/react'
import { useMemo } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import guideEn from '../guide/guide.en.md?raw'
import guideVi from '../guide/guide.vi.md?raw'
import { INTRO_ID, splitGuide } from '../guide/guideSections.js'
import { getLanguage, t } from '../i18n.js'
import { COPY_BLOCKS } from '../ui/markdownBlocks.js'
import { Section } from '../ui/Section.js'

function GuideMarkdown({ text }: { readonly text: string }): React.JSX.Element {
  return (
    <div className="markdown-view">
      <Markdown remarkPlugins={[remarkGfm]} components={COPY_BLOCKS}>
        {text}
      </Markdown>
    </div>
  )
}

export function GuideSection(): React.JSX.Element {
  const language = getLanguage()
  const sections = useMemo(() => splitGuide(language === 'vi' ? guideVi : guideEn), [language])
  const intro = sections.find((section) => section.id === INTRO_ID)
  const chapters = sections.filter((section) => section.id !== INTRO_ID)

  const scrollTo = (id: string): void => {
    document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <Section title={t('Guide', 'Hướng dẫn')}>
      {intro === undefined ? null : <GuideMarkdown text={intro.body} />}
      <nav aria-label={t('Contents', 'Mục lục')} className="flex flex-col gap-1">
        <p className="text-sm font-semibold">{t('Contents', 'Mục lục')}</p>
        <div className="flex flex-wrap gap-1">
          {chapters.map((section) => (
            <Button
              key={section.id}
              size="sm"
              variant="secondary"
              onPress={() => {
                scrollTo(section.id)
              }}
            >
              {section.title}
            </Button>
          ))}
        </div>
      </nav>
      {chapters.map((section) => (
        <section
          key={section.id}
          id={`guide-${section.id}`}
          className="flex flex-col gap-2 rounded-2xl bg-surface-secondary p-4"
        >
          <h3 className="text-base font-semibold">{section.title}</h3>
          <GuideMarkdown text={section.body} />
        </section>
      ))}
    </Section>
  )
}
