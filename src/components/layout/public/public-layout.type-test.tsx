import {
  BreadcrumbPlaceholder,
  Footer,
  FooterNavigation,
  Header,
  MobileNavigation,
  PrimaryNavigation,
  PublicAdvertisement,
  PublicLayout,
  SearchTrigger,
  SignalRail,
  SkipToContent,
  ThemeToggle,
  UtilityBar,
} from "@/components/layout/public";

export function PublicLayoutTypeContract() {
  return (
    <PublicLayout
      locale="en"
      utilityBar={<UtilityBar locale="en" liveLabel="Live" />}
      header={
        <Header
          locale="en"
          primaryNavigation={<PrimaryNavigation locale="en" />}
          mobileNavigation={<MobileNavigation locale="en" />}
          search={<SearchTrigger label="Search" />}
          theme={<ThemeToggle />}
        />
      }
      signalRail={
        <SignalRail
          state="developing"
          label="Developing"
          headline="A concise editorial signal"
          href="/en"
        />
      }
      footer={
        <Footer
          locale="en"
          navigation={<FooterNavigation locale="en" />}
        />
      }
    >
      <SkipToContent targetId="main-content" />
      <BreadcrumbPlaceholder items={[{ label: "Home", href: "/en" }]} />
      <PublicAdvertisement />
    </PublicLayout>
  );
}
