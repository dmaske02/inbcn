"use client";

import { useState } from "react";

import styles from "./reporter-demo.module.css";

type View = "home" | "stories" | "live" | "application" | "profile";

const stories = [
  { title: "Monsoon flooding disrupts Kothrud traffic", locality: "Kothrud, Pune", status: "Under review", tone: "review" },
  { title: "Women-led market opens near Deccan", locality: "Deccan, Pune", status: "Published", tone: "published" },
  { title: "PMC begins overnight road repairs", locality: "Shivajinagar, Pune", status: "Draft", tone: "draft" },
] as const;

function SignalIcon({ name }: Readonly<{ name: View }>) {
  const paths: Record<View, React.ReactNode> = {
    home: <><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5M9 21v-7h6v7"/></>,
    stories: <><path d="M6 3h12v18H6z"/><path d="M9 7h6M9 11h6M9 15h4"/></>,
    live: <><circle cx="12" cy="12" r="3"/><path d="M6.3 6.3a8 8 0 0 0 0 11.4M17.7 6.3a8 8 0 0 1 0 11.4"/></>,
    application: <><path d="M5 3h14v18H5z"/><path d="m8 12 2.5 2.5L16 9M8 6h8"/></>,
    profile: <><circle cx="12" cy="8" r="4"/><path d="M4.5 21a7.5 7.5 0 0 1 15 0"/></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24">{paths[name]}</svg>;
}

function DemoHeader() {
  return (
    <>
      <div className={styles.demoNotice}><span>Client preview</span><strong>Synthetic data only</strong></div>
      <header className={styles.header}>
        <div className={styles.brand}><span>IN</span><b>BCN</b><small>REPORTER</small></div>
        <div className={styles.signal}><i/><span>Field desk online</span></div>
      </header>
    </>
  );
}

function HomeView({ setView }: Readonly<{ setView: (view: View) => void }>) {
  return (
    <div className={styles.view}>
      <section className={styles.greeting}>
        <div><p>Sunday · 24 August</p><h1>Good morning,<br/>Meera.</h1></div>
        <div className={styles.avatar} aria-label="Synthetic reporter avatar">MJ</div>
      </section>
      <section className={styles.readiness}>
        <div className={styles.readinessTop}><span>FIELD READINESS</span><strong>All systems ready</strong></div>
        <div className={styles.readinessGrid}>
          <div><i className={styles.readyDot}/>Identity verified</div><div><i className={styles.readyDot}/>Membership active</div>
          <div><i className={styles.readyDot}/>Location enabled</div><div><i className={styles.readyDot}/>Live permission</div>
        </div>
      </section>
      <button className={styles.primaryAction} onClick={() => setView("stories")} type="button">
        <span><small>NEW REPORT</small>Capture a field story</span><b>＋</b>
      </button>
      <section className={styles.section}>
        <div className={styles.sectionHeading}><h2>Today at a glance</h2><span>3 updates</span></div>
        <div className={styles.statGrid}>
          <article><strong>02</strong><span>Stories in review</span></article>
          <article><strong>01</strong><span>Published today</span></article>
          <article><strong>18:30</strong><span>Live window</span></article>
        </div>
      </section>
      <section className={styles.assignment}>
        <div className={styles.assignmentTime}><strong>18:30</strong><span>TODAY</span></div>
        <div><span className={styles.eyebrow}>APPROVED LIVE</span><h3>Evening traffic update</h3><p>University Road · 20 minute window</p></div>
        <button aria-label="Open live broadcast preview" onClick={() => setView("live")} type="button">→</button>
      </section>
    </div>
  );
}

function StoriesView() {
  return (
    <div className={styles.view}>
      <div className={styles.pageTitle}><span>03 TOTAL</span><h1>My stories</h1><p>Draft, submit and follow editorial decisions.</p></div>
      <button className={styles.captureButton} type="button"><span>＋</span><div><strong>Start a new field report</strong><small>Text · Photo · Video · Location</small></div></button>
      <div className={styles.storyList}>
        {stories.map((story, index) => (
          <article className={styles.story} key={story.title}>
            <div className={styles.storyNumber}>0{index + 1}</div>
            <div><span className={`${styles.status} ${styles[story.tone]}`}>{story.status}</span><h2>{story.title}</h2><p>⌖ {story.locality}</p></div>
            <span className={styles.chevron}>›</span>
          </article>
        ))}
      </div>
      <section className={styles.uploadCard}>
        <div><span>MEDIA UPLOAD</span><strong>market-interview.mp4</strong></div><b>72%</b>
        <div className={styles.progress}><i/></div><p>Upload continues safely if your connection changes.</p>
      </section>
    </div>
  );
}

function LiveView() {
  const [broadcasting, setBroadcasting] = useState(false);
  return (
    <div className={styles.liveView}>
      <div className={styles.liveTop}><span className={styles.eyebrow}>APPROVED SESSION</span><h1>Evening traffic update</h1><p>University Road, Pune · 18:30–18:50</p></div>
      <div className={`${styles.camera} ${broadcasting ? styles.cameraLive : ""}`}>
        <div className={styles.cameraGrid}/>
        <div className={styles.cameraBadge}>{broadcasting ? <><i/> LIVE · 00:42</> : "CAMERA PREVIEW"}</div>
        <div className={styles.focusFrame}/>
        <p>{broadcasting ? "Synthetic broadcast simulation" : "Camera and microphone check"}</p>
      </div>
      <div className={styles.recordingDisclosure}><span>●</span><p><strong>This session is recorded server-side.</strong><br/>The replay stays private until an editor publishes it.</p></div>
      <div className={styles.deviceChecks}><span>✓ Camera ready</span><span>✓ Microphone ready</span><span>✓ Network strong</span></div>
      <button className={broadcasting ? styles.stopButton : styles.goLiveButton} onClick={() => setBroadcasting(!broadcasting)} type="button">
        {broadcasting ? "End demo broadcast" : "Start demo broadcast"}
      </button>
      <p className={styles.simulationNote}>Preview interaction only — no camera, room or recording is created.</p>
    </div>
  );
}

function ApplicationView() {
  const steps = [
    ["Mobile verified", "Completed"], ["Application details", "Completed"], ["₹100 fee", "Payment captured"],
    ["Identity check", "KYC verified"], ["Editorial review", "Approved"],
  ] as const;
  return (
    <div className={styles.view}>
      <div className={styles.pageTitle}><span>APPLICATION BCN-R-02418</span><h1>You&apos;re approved.</h1><p>Your reporting membership is active until 24 August 2027.</p></div>
      <section className={styles.approvalStamp}><div>✓</div><span><small>VERIFIED FIELD REPORTER</small><strong>Meera Joshi</strong></span></section>
      <ol className={styles.timeline}>
        {steps.map(([title, detail], index) => <li key={title}><i>{index + 1}</i><div><strong>{title}</strong><span>{detail}</span></div><b>✓</b></li>)}
      </ol>
      <section className={styles.receipt}><span>Annual membership</span><strong>₹100 paid</strong><small>Razorpay test payment · Synthetic receipt</small></section>
      <p className={styles.privacyLine}>Identity and payment details remain private. Only your verified name, approved portrait and public reporting profile appear on published work.</p>
    </div>
  );
}

function ProfileView() {
  return (
    <div className={styles.view}>
      <div className={styles.pageTitle}><span>PUBLIC PROFILE PREVIEW</span><h1>Your byline,<br/>verified.</h1></div>
      <section className={styles.profileCard}>
        <div className={styles.profilePortrait}>MJ</div>
        <div><span className={styles.verifiedBadge}>✓ VERIFIED REPORTER</span><h2>Meera Joshi</h2><p>Pune district · Civic affairs, transport</p></div>
        <blockquote>“Reporting from the street, with context from the people who live there.”</blockquote>
        <div className={styles.profileStats}><span><strong>28</strong>Published stories</span><span><strong>04</strong>Live reports</span><span><strong>1 yr</strong>Member</span></div>
      </section>
      <section className={styles.permissions}>
        <h2>Reporter permissions</h2>
        <div><span>Direct publication</span><b>Admin approval required</b></div>
        <div><span>Request live broadcast</span><b className={styles.permissionOn}>Enabled</b></div>
        <div><span>Membership</span><b className={styles.permissionOn}>Active</b></div>
      </section>
    </div>
  );
}

export function ReporterDemo() {
  const [view, setView] = useState<View>("home");
  const views = { home: <HomeView setView={setView}/>, stories: <StoriesView/>, live: <LiveView/>, application: <ApplicationView/>, profile: <ProfileView/> };
  const labels: Record<View, string> = { home: "Home", stories: "Stories", live: "Live", application: "Apply", profile: "Profile" };
  return (
    <main className={styles.shell}>
      <div className={styles.backdrop}><span>FIELD DESK</span><strong>REPORT.<br/>VERIFY.<br/>PUBLISH.</strong><p>Mobile reporting for the people closest to the story.</p></div>
      <section className={styles.phone} aria-label="INBCN Reporter client preview">
        <DemoHeader/>
        <div className={styles.content}>{views[view]}</div>
        <nav aria-label="Demo navigation" className={styles.bottomNav}>
          {(Object.keys(labels) as View[]).map((item) => <button aria-current={view === item ? "page" : undefined} className={view === item ? styles.activeNav : ""} key={item} onClick={() => setView(item)} type="button"><SignalIcon name={item}/><span>{labels[item]}</span></button>)}
        </nav>
      </section>
      <aside className={styles.demoGuide}><span>CLIENT WALKTHROUGH</span><h2>Try the field workflow.</h2><p>Use the five tabs inside the phone to review onboarding, story capture, live approval and public attribution.</p><div><i/>No real services connected</div></aside>
    </main>
  );
}
