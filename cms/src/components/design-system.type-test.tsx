import {
  AdvertisementPlaceholder,
  Breadcrumb,
  CategoryBadge,
  CompactCard,
  EmptyState,
  ErrorState,
  FeaturedCard,
  HeroCard,
  HorizontalCard,
  LanguageSwitcher,
  ReadingProgress,
  SearchTrigger,
  ShareButton,
  StoryCard,
  StoryMeta,
  ThemeToggle,
  Timestamp,
} from "@/components/common";
import {
  Container,
  Footer,
  Grid,
  Header,
  Logo,
  NavigationItem,
  Page,
  ResponsiveNavigation,
  Section,
  SignalRail,
  UtilityBar,
} from "@/components/layout";
import {
  Avatar,
  AvatarFallback,
  Badge,
  Button,
  Card,
  CardContent,
  Chip,
  Dropdown,
  DropdownContent,
  DropdownItem,
  DropdownTrigger,
  Skeleton,
  Typography,
} from "@/components/ui";

const story = {
  title: "A multilingual headline",
  href: "/en/story",
  summary: "A concise summary.",
  category: "National",
  publishedAt: "2026-07-30T10:42:00+05:30",
  image: { src: "/placeholder.jpg", alt: "News scene" },
} as const;

export function DesignSystemTypeContract() {
  return (
    <Page>
      <ReadingProgress />
      <UtilityBar date="Thursday, 30 July" liveLabel="Live" />
      <Header
        logo={<Logo />}
        navigation={<NavigationItem href="/en">Latest</NavigationItem>}
        actions={<SearchTrigger label="Search" />}
        mobileNavigation={
          <ResponsiveNavigation label="Menu">
            <NavigationItem href="/en">Latest</NavigationItem>
          </ResponsiveNavigation>
        }
      />
      <SignalRail
        state="breaking"
        headline="Important verified update"
        href="/en/story"
        timestamp="10:42"
      />
      <Container>
        <Section title="Design system">
          <Grid columns={{ base: 1, md: 2, lg: 3 }}>
            <HeroCard {...story} />
            <FeaturedCard {...story} />
            <StoryCard {...story} />
            <HorizontalCard {...story} />
            <CompactCard {...story} />
          </Grid>
          <Typography variant="headline">Headline</Typography>
          <Button variant="signal">Action</Button>
          <Card>
            <CardContent>Content</CardContent>
          </Card>
          <Badge variant="verified">Verified</Badge>
          <Chip selected>National</Chip>
          <Avatar>
            <AvatarFallback>IN</AvatarFallback>
          </Avatar>
          <Dropdown>
            <DropdownTrigger asChild>
              <Button variant="outline">Open</Button>
            </DropdownTrigger>
            <DropdownContent>
              <DropdownItem>Item</DropdownItem>
            </DropdownContent>
          </Dropdown>
          <CategoryBadge>National</CategoryBadge>
          <Timestamp value={story.publishedAt} />
          <StoryMeta
            publishedAt={story.publishedAt}
            readingTimeMinutes={4}
          />
          <AdvertisementPlaceholder label="Advertisement" />
          <Skeleton className="h-6" />
          <EmptyState title="No stories" />
          <ErrorState title="Unable to load" />
          <LanguageSwitcher
            currentLocale="en"
            locales={[
              { code: "en", label: "English", href: "/en" },
              { code: "hi", label: "हिन्दी", href: "/hi" },
            ]}
          />
          <ThemeToggle />
          <Breadcrumb
            items={[
              { label: "Home", href: "/en" },
              { label: "National" },
            ]}
          />
          <ShareButton title={story.title} />
        </Section>
      </Container>
      <Footer brand={<Logo />} />
    </Page>
  );
}
