import { Disclosure } from '@heroui/react'

interface AdvancedDisclosureProps {
  readonly title: string
  readonly children: React.ReactNode
}

// Collapsed by default; the trigger is a button named after the title.
export function AdvancedDisclosure({
  title,
  children,
}: AdvancedDisclosureProps): React.JSX.Element {
  return (
    <Disclosure>
      <Disclosure.Heading>
        <Disclosure.Trigger className="flex w-full items-center justify-between rounded-lg px-2 py-1 text-sm font-medium">
          {title}
          <Disclosure.Indicator />
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className="flex flex-col gap-3 px-2 pt-2">{children}</Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  )
}
