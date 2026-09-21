/*This AlertRuleEngine checks each parsed Docker log against the available alert rules.
 If the log message matches a rule’s pattern, it returns the matched rule along with the log as a MatchedAlert;
 if no rule matches, it returns null.*/ 

import { ParsedLog } from "../parser/LogParser";
import { AlertRule, defaultRules } from "./defaultRules";

export interface MatchedAlert {
    rule: AlertRule;
    log: ParsedLog;
}

export class AlertRuleEngine {
    constructor(private readonly rules: AlertRule[] = defaultRules) {}

    evaluate(log: ParsedLog): MatchedAlert | null {
        const matchedRule = this.rules.find((rule) =>
            rule.pattern.test(log.message)
        );

        if (!matchedRule) {
            return null;
        }

        return {
            rule: matchedRule,
            log,
        };
    }
}