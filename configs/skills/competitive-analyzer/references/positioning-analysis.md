# Positioning Analysis — Reference

Methodology for perceptual mapping, white space identification, and competitive moat assessment.

## Perceptual Mapping Methodology

A perceptual map plots competitors on two dimensions that customers use to evaluate and choose products. The map reveals clusters, gaps, and positioning opportunities.

### Step 1: Dimension Selection

Dimensions must be:
- **Customer-relevant:** Based on how buyers evaluate options, not internal product metrics
- **Discriminating:** Competitors should spread across the dimension, not cluster at one end
- **Independent:** The two dimensions should not be highly correlated

### Common Dimension Pairs by Industry

| Industry | Dimension X | Dimension Y |
|----------|------------|------------|
| SaaS / B2B Software | Ease of use (simple ← → complex) | Target segment (SMB ← → Enterprise) |
| Developer Tools | Abstraction level (low-level ← → high-level) | Flexibility (opinionated ← → configurable) |
| E-commerce Platforms | Technical skill required (no-code ← → developer) | Scale (small shop ← → high-volume) |
| Cloud Infrastructure | Managed level (IaaS ← → fully managed) | Ecosystem breadth (focused ← → broad) |
| Analytics / BI | User skill (business user ← → data engineer) | Data scale (small data ← → big data) |
| CRM | Sales motion (self-serve ← → sales-led) | Scope (sales-only ← → full CX suite) |
| Security | Deployment (cloud-native ← → on-premise) | Scope (point solution ← → platform) |
| Fintech | Audience (consumer ← → enterprise) | Product scope (single product ← → full stack) |
| AI/ML | Build vs. buy (framework ← → turnkey solution) | Specialization (general purpose ← → domain-specific) |
| Communication | Synchronous ← → Asynchronous | Internal team ← → External/customer-facing |

### Step 2: Evidence-Based Positioning

Position competitors based on evidence, not assumption:
- Product capabilities and feature analysis (from competitive matrix)
- Pricing signals (high price often correlates with enterprise positioning)
- Marketing messaging and website copy (who do they say they serve?)
- Customer reviews (who actually uses it and what do they say?)
- Case studies and logos (what size/type of company?)
- Job postings (what kind of team are they building?)

### Step 3: Map Construction

For text-based maps, use ASCII:

```
Enterprise
    |
    |   [Salesforce]         [SAP]
    |
    |        [HubSpot]
    |                    [Dynamics]
    |
    |   [Pipedrive]
    |        [Close]
    |
SMB  ─────────────────────────────── Full Suite
         Focused CRM
```

Guidelines:
- Label axes clearly with the low and high ends
- Place competitors based on relative positioning, not absolute scores
- Group competitors that occupy similar positions (strategic groups)
- Mark the target product position with a distinct indicator

## White Space Identification

White space is an unoccupied region on the positioning map. Not all white space is opportunity.

### White Space Evaluation Framework

| Question | Signal |
|----------|--------|
| Is there customer demand in this space? | Review forums, search volume, support requests for unmet needs |
| Have competitors tried and failed here? | Dead products, pivots away from this position = possible "graveyard" |
| Is the space empty because it is economically unviable? | Low willingness to pay, high cost to serve, small addressable market |
| Can you credibly occupy this position? | Technical capability, brand alignment, go-to-market fit |
| Is the space defensible once occupied? | First-mover advantage potential, switching costs, network effects |

### Types of White Space

| Type | Description | Example |
|------|-------------|---------|
| **Segment gap** | An underserved customer segment | Mid-market (too big for SMB tools, too small for enterprise) |
| **Value gap** | A combination of attributes no one delivers | Enterprise security with SMB ease of use |
| **Channel gap** | An underserved distribution channel | Self-serve purchasing for a traditionally sales-led category |
| **Geography gap** | Underserved region or market | Localized solution for non-English markets |

## Positioning Sustainability

A position is sustainable only if competitors cannot easily replicate it.

### Sustainability Criteria

| Criterion | Strong Position | Weak Position |
|-----------|----------------|---------------|
| Resource alignment | Position matches core competencies | Position requires building from scratch |
| Customer perception | Customers associate the brand with this position | Customers see the brand differently |
| Cost structure | Cost structure supports the position profitably | Position requires unsustainable pricing |
| Competitor response | Competitors cannot easily reposition | Competitors can match within 1-2 quarters |
| Market dynamics | Market trends reinforce the position | Market trends work against the position |

## Moat Taxonomy

Competitive moats are structural advantages that protect a business from competition. They compound over time when reinforced, or erode when neglected.

### Moat Types

#### 1. Network Effects

The product becomes more valuable as more people use it.

| Subtype | Mechanism | Example |
|---------|-----------|---------|
| Direct | More users = more value for each user | Social networks, messaging platforms |
| Indirect (cross-side) | More users on side A = more value for side B | Marketplaces (more buyers attract more sellers) |
| Data network effects | More usage = better data = better product | Search engines, recommendation systems |
| Content network effects | More users = more content = more value | YouTube, Stack Overflow |

**Assessment questions:**
- Does each new user make the product measurably better for existing users?
- At what scale do network effects become self-sustaining?
- Are the network effects local (city, team) or global?
- Can a competitor bootstrap their own network with a subset of users?

#### 2. Switching Costs

The total cost (time, money, effort, risk) a customer incurs to switch to a competitor.

| Component | Examples |
|-----------|---------|
| Data migration | Moving data between systems, format compatibility |
| Workflow disruption | Retraining users, rebuilding processes, lost productivity |
| Integration rework | Reconnecting integrations, APIs, automations |
| Contractual lock-in | Annual contracts, termination fees, data portability delays |
| Learning curve | New UI, new mental model, certification requirements |

**Assessment questions:**
- How long does migration take (hours, days, weeks, months)?
- What percentage of customers who evaluate alternatives actually switch?
- Are switching costs increasing or decreasing over time (industry trend)?
- Do switching costs scale with usage (more data = harder to leave)?

#### 3. IP / Technology

Proprietary technology, patents, or trade secrets that competitors cannot legally or practically replicate.

**Assessment questions:**
- Are there granted patents with meaningful claims?
- How long would it take a well-funded competitor to replicate the technology?
- Is the technology advantage widening or narrowing?
- Does the technology create measurable performance advantages (speed, accuracy, cost)?

#### 4. Brand

Recognition, trust, and preference that influence purchasing decisions independent of product features.

**Assessment questions:**
- Is the brand the default category reference (e.g., "Slack" for team chat)?
- Does the brand command a price premium over functionally equivalent alternatives?
- How long would it take a new entrant to build equivalent brand recognition?
- Is brand strength concentrated in a segment or broadly recognized?

#### 5. Data Advantage

Proprietary datasets or data feedback loops that improve the product and cannot be easily replicated.

**Assessment questions:**
- Is the data proprietary (generated by the product) or acquirable (public or purchasable)?
- Does more data meaningfully improve the product (diminishing returns threshold)?
- Can a competitor cold-start with synthetic or public data?
- Is the data advantage compounding (each user adds unique data)?

#### 6. Cost Advantage

Structural cost advantages that allow the business to deliver equivalent value at lower cost.

| Source | Mechanism |
|--------|-----------|
| Economies of scale | Higher volume = lower per-unit cost |
| Proprietary process | More efficient operations, unique manufacturing |
| Favorable access | Cheaper inputs, exclusive supplier relationships |
| Geographic advantage | Lower labor costs, proximity to customers |

**Assessment questions:**
- What is the per-unit cost difference vs. the next competitor?
- Is the cost advantage structural (hard to replicate) or operational (can be copied)?
- Does the cost advantage grow or shrink with scale?

#### 7. Regulatory Moat

Government regulations, licenses, or compliance requirements that restrict entry.

**Assessment questions:**
- Is a specific license or certification required to operate?
- How long and expensive is the regulatory approval process?
- Are regulations likely to tighten (strengthening the moat) or loosen?
- Can regulation be circumvented by a different product architecture?

## Defensibility Assessment Scoring

### Per-Moat Scoring

| Strength | Definition |
|----------|-----------|
| **None** | Moat type does not exist for this product |
| **Weak** | Moat exists but can be overcome in < 6 months with moderate investment |
| **Moderate** | Moat provides meaningful advantage. Overcoming it takes 1-2 years of focused effort |
| **Strong** | Moat is a significant barrier. Replication requires 2-5 years and major investment |

### Overall Defensibility Rating

| Rating | Criteria |
|--------|----------|
| **Weak** | Zero or one weak moats. Any funded competitor can replicate the product in under a year. |
| **Moderate** | One moderate moat or two weak moats. Provides temporary advantage but erodes without reinforcement. |
| **Strong** | Two or more moderate moats, or one strong moat. Competitors face meaningful structural disadvantage. |
| **Very Strong** | Multiple strong moats that reinforce each other (flywheel). Compounding advantage that widens over time. Example: more users → more data → better product → more users. |

### Moat Reinforcement vs. Erosion

Moats are not static. Assess trajectory:

| Signal | Moat Strengthening | Moat Weakening |
|--------|-------------------|----------------|
| Network effects | User growth accelerating | User growth stalling, multi-homing common |
| Switching costs | Platform stickiness increasing, more integrations | Open standards adoption, easy export tools |
| Technology | R&D investment growing, patent portfolio expanding | Competitors closing the gap, open-source alternatives |
| Brand | NPS rising, organic growth | Brand dilution, negative press, competitor brand investment |
| Data | Proprietary data growing, model accuracy improving | Public datasets catching up, data commoditization |
| Cost | Unit economics improving at scale | Competitors achieving similar cost structure |
