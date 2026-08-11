import type { HomepageViewModel } from "@/features/news/server/services/homepage.service";
import { HomepageCategoryRails, HomepageEditorsSection, HomepageFeedSection, HomepageHeadlineSection, HomepageHeroSection, HomepageRankedSection } from "./homepage-sections";

type HomepageProps={locale:string;data:HomepageViewModel};
export async function Homepage({locale,data}:HomepageProps) { const heroDeck=data.editorPicks.slice(0,3); const lowerEditorPicks=data.editorPicks.slice(3); return <main className="proto-page"><div className="proto-wrap">
  <div className="proto-ad-slot"><span>Advertisement</span><small>728 × 90 reserved</small></div>
  {data.featured?<HomepageHeroSection locale={locale} story={data.featured} deck={heroDeck}/>:null}
  {data.topHeadlines.length?<HomepageHeadlineSection stories={data.topHeadlines}/>:null}
  {data.latest.length||data.trending.length?<div className="proto-content-grid">{data.latest.length?<HomepageFeedSection locale={locale} title="Latest news" stories={data.latest}/>:null}<aside className="proto-side-stack">{data.trending.length?<HomepageRankedSection title="Trending" stories={data.trending}/>:null}<div className="proto-ad-slot proto-ad-rectangle"><span>Advertisement</span><small>300 × 250 reserved</small></div></aside></div>:null}
  {data.categoryRails.length?<HomepageCategoryRails locale={locale} rails={data.categoryRails}/>:null}
  {lowerEditorPicks.length?<HomepageEditorsSection stories={lowerEditorPicks}/>:null}
 </div></main>; }
