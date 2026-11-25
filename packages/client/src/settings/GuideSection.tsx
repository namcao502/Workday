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
    <Section title={t('settings.guide')}>
      {intro === undefined ? null : <GuideMarkdown text={intro.body} />}
      <div className="flex flex-col gap-4 md:flex-row md:items-start">
        <nav
          aria-label={t('settings.contents')}
          className="flex shrink-0 flex-col gap-1 md:sticky md:top-4 md:w-56"
        >
          <p className="text-sm font-semibold">{t('settings.contents')}</p>
          {/* A row of chips that scrolls sideways on a phone; a pinned column beside the chapters from md up. */}
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1 md:mx-0 md:flex-col md:overflow-visible md:px-0">
            {chapters.map((section) => (
              <Button
                key={section.id}
                size="sm"
                variant="secondary"
                className="shrink-0 md:justify-start"
                onPress={() => {
                  scrollTo(section.id)
                }}
              >
                {section.title}
              </Button>
            ))}
          </div>
        </nav>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
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
        </div>
      </div>
    </Section>
  )
}
