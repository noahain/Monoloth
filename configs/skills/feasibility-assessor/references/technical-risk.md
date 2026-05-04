# Technical Risk Reference

## Risk Dimension Scoring Rubric

Each dimension is scored 1-5. The composite technical risk score is the weighted average across all dimensions.

### Technical Novelty

| Score | Definition               | Indicators                                                              |
| ----- | ------------------------ | ----------------------------------------------------------------------- |
| 1     | Proven, commoditized     | Standard web app, CRUD operations, well-documented APIs                 |
| 2     | Established with nuances | Known patterns but requires domain expertise (e.g., payment processing) |
| 3     | Emerging but validated   | Technology adopted by early majority, production case studies exist     |
| 4     | Cutting edge             | Limited production deployments, active development, APIs changing       |
| 5     | Research-grade           | No production-proven solution exists, requires original R&D             |

### Integration Complexity

| Score | Definition           | Indicators                                                         |
| ----- | -------------------- | ------------------------------------------------------------------ |
| 1     | Self-contained       | No external dependencies, single data store                        |
| 2     | Minimal integration  | 1-2 well-documented external APIs, standard auth                   |
| 3     | Moderate integration | 3-5 external services, webhook handling, data synchronization      |
| 4     | Complex integration  | 6+ services, real-time data flows, multi-provider orchestration    |
| 5     | Integration-dominant | System value comes from stitching many unreliable external systems |

### Scale Readiness

| Score | Definition                     | Indicators                                                                               |
| ----- | ------------------------------ | ---------------------------------------------------------------------------------------- |
| 1     | Scale-ready by default         | Stateless services, horizontal scaling, managed infrastructure                           |
| 2     | Minor adjustments needed       | Add caching layer, read replicas, CDN                                                    |
| 3     | Architectural changes at scale | Requires sharding, async processing, queue-based architecture                            |
| 4     | Significant re-architecture    | Monolith-to-microservices, multi-region, custom infrastructure                           |
| 5     | Fundamental constraints        | Physics-bound (latency), cost-prohibitive at scale, single-vendor lock-in with no escape |

### Data Risk

| Score | Definition                       | Indicators                                                                                           |
| ----- | -------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 1     | Public/owned data, no regulation | Open datasets, user-generated non-sensitive content                                                  |
| 2     | Basic data governance            | Standard PII (name, email), basic privacy policy required                                            |
| 3     | Regulated data                   | Financial records, health-adjacent data, children's data (COPPA)                                     |
| 4     | Heavily regulated                | Medical records (HIPAA), financial transactions (PCI), EU citizens (GDPR with complex processing)    |
| 5     | Highest sensitivity              | National security, biometric data, cross-border health/financial data with conflicting jurisdictions |

### Security / Compliance

| Score | Definition           | Indicators                                                                                             |
| ----- | -------------------- | ------------------------------------------------------------------------------------------------------ |
| 1     | Minimal requirements | No sensitive data, standard HTTPS, basic auth                                                          |
| 2     | Standard security    | User authentication, encrypted storage, audit logging                                                  |
| 3     | Enhanced security    | Role-based access, data encryption at rest and transit, penetration testing                            |
| 4     | Compliance-driven    | SOC 2 Type II, HIPAA BAA, PCI DSS Level 2+, regular third-party audits                                 |
| 5     | Maximum compliance   | FedRAMP, PCI DSS Level 1, multiple overlapping compliance frameworks, dedicated security team required |

## Complexity Classification

### Level 1 — Simple

**Characteristics**: single service, single database, server-rendered or basic SPA, standard authentication, no real-time requirements.

**Examples**: blog platform, internal tool, landing page with form submission, basic CMS, portfolio site.

**Typical timeline**: 2-6 weeks MVP.

### Level 2 — Moderate

**Characteristics**: multiple services or a well-structured monolith, third-party integrations (payments, email, analytics), background job processing, basic caching, standard CI/CD.

**Examples**: e-commerce store, SaaS dashboard, API platform with documentation portal, CRM, project management tool.

**Typical timeline**: 2-4 months MVP.

### Level 3 — Complex

**Characteristics**: distributed architecture, real-time communication, multi-tenant with isolation requirements, complex data pipelines, horizontal scaling, multiple deployment targets.

**Examples**: two-sided marketplace, collaboration platform, fintech application, streaming service, multi-tenant enterprise SaaS.

**Typical timeline**: 4-9 months MVP.

### Level 4 — Novel

**Characteristics**: R&D component, unproven architecture at target scale, custom infrastructure, hardware-software integration, novel algorithms or ML models.

**Examples**: autonomous systems, novel blockchain applications, real-time ML inference at edge, hardware IoT platform, language model fine-tuning pipeline.

**Typical timeline**: 9-18+ months MVP, high variance.

## Technology Maturity Assessment

Apply Gartner's hype cycle positioning as a risk signal:

| Phase                         | Risk Implication                                       | Action                                       |
| ----------------------------- | ------------------------------------------------------ | -------------------------------------------- |
| Innovation Trigger            | Maximum uncertainty, few production users              | Score novelty 4-5, plan for pivots           |
| Peak of Inflated Expectations | Hype exceeds reality, capabilities overestimated       | Validate vendor claims independently         |
| Trough of Disillusionment     | Survivors emerge, real limitations known               | Good time to adopt if fundamentals are sound |
| Slope of Enlightenment        | Best practices forming, production patterns documented | Lower risk, growing ecosystem                |
| Plateau of Productivity       | Commoditized, well-understood                          | Score novelty 1-2, reliable choice           |

## Dependency Risk Evaluation

For each critical external dependency, assess:

1. **Vendor viability**: is the provider financially stable, or a startup that might shut down
2. **API stability**: frequency of breaking changes, deprecation policy, versioning strategy
3. **Lock-in depth**: how much effort to switch providers (days vs months)
4. **Redundancy options**: are there alternative providers for the same capability
5. **SLA alignment**: does the dependency's uptime SLA meet your requirements

**Risk mitigation strategies**:

- Abstract external services behind internal interfaces
- Maintain a tested fallback for single-vendor critical paths
- Pin API versions and monitor deprecation announcements
- Keep vendor-specific code isolated in adapter modules

## Scale Readiness Checklist

- [ ] Stateless application tier (no local session storage)
- [ ] Database read replicas or connection pooling configured
- [ ] Background job processing separated from request handling
- [ ] CDN for static assets and cacheable responses
- [ ] Rate limiting on all public endpoints
- [ ] Monitoring and alerting on latency, error rate, saturation
- [ ] Load testing performed at 3-5x expected peak
- [ ] Auto-scaling policies defined and tested
- [ ] Database query performance profiled under load
- [ ] Cache invalidation strategy documented
- [ ] Message queue for async workloads
- [ ] Circuit breakers on external service calls

## Build vs Buy Decision Matrix

| Factor              | Build                                 | Buy / Integrate                  | Partner                   |
| ------------------- | ------------------------------------- | -------------------------------- | ------------------------- |
| Core differentiator | The feature IS your product's value   | Commodity capability             | Adjacent expertise        |
| Time to market      | Can wait 3+ months                    | Need it in weeks                 | Need domain credibility   |
| Maintenance burden  | Team has capacity for ongoing upkeep  | Prefer vendor-managed            | Shared responsibility     |
| Customization needs | Highly specific to your domain        | Standard implementation works    | Need co-development       |
| Cost at scale       | Cheaper to own at volume              | Cheaper to rent at current scale | Revenue share viable      |
| Data sensitivity    | Data cannot leave your infrastructure | Vendor compliance is sufficient  | Contractual controls work |

Decision: if the capability is a core differentiator AND you have the team to maintain it, build. Otherwise, default to buy. Partner when you need domain expertise you lack and the relationship creates mutual value.

## MVP Scope Definition

An MVP tests the riskiest assumption about value creation with the minimum feature set.

### Scoping methodology

1. List all planned features
2. For each feature, classify: **must-have** (core value proposition fails without it), **should-have** (improves experience but not critical), **nice-to-have** (polish, optimization)
3. MVP = must-have features only
4. Validate: can a user complete the core job-to-be-done with only must-have features? If no, re-examine classifications.

### Common MVP anti-patterns

- Building admin panels before validating user demand
- Implementing scale infrastructure before proving product-market fit
- Adding multiple auth providers when email/password suffices
- Building mobile apps when a responsive web app tests the hypothesis
- Automating processes that can be done manually at MVP scale (Wizard of Oz approach)

## Development Effort Estimation

### Cone of Uncertainty

Estimate accuracy improves as the project progresses:

| Phase                       | Estimate Accuracy    |
| --------------------------- | -------------------- |
| Initial concept             | 0.25x to 4x actual   |
| Approved product definition | 0.5x to 2x actual    |
| Requirements complete       | 0.67x to 1.5x actual |
| UI design complete          | 0.8x to 1.25x actual |
| Detailed design complete    | 0.9x to 1.1x actual  |

Always present estimates as ranges, never single numbers.

### T-Shirt Sizing

| Size | Effort Range         | Team Weeks (2-3 person team) |
| ---- | -------------------- | ---------------------------- |
| XS   | Trivial change       | < 1 week                     |
| S    | Small feature        | 1-2 weeks                    |
| M    | Medium feature       | 2-4 weeks                    |
| L    | Large feature        | 1-2 months                   |
| XL   | Epic / multi-feature | 2-4 months                   |
| XXL  | Major system         | 4-9 months                   |

### Estimation multipliers

Apply these multipliers to base estimates:

- New team to the domain: 1.5x
- New technology stack: 1.3x
- Compliance requirements: 1.5-2x
- Third-party integration per service: +1-2 weeks each
- Multi-platform (web + mobile): 1.8x
- Internationalization: 1.3x
