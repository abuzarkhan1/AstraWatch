package v1

import (
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/runtime"
)

// +genclient
// +kubebuilder:object:root=true
// +kubebuilder:subresource:status
// +k8s:deepcopy-gen:interfaces=k8s.io/apimachinery/pkg/runtime.Object

type AutoHealingRule struct {
	metav1.TypeMeta   `json:",inline"`
	metav1.ObjectMeta `json:"metadata,omitempty"`

	Spec   AutoHealingRuleSpec   `json:"spec,omitempty"`
	Status AutoHealingRuleStatus `json:"status,omitempty"`
}

func (in *AutoHealingRule) DeepCopyObject() runtime.Object {
	return in.DeepCopy()
}

func (in *AutoHealingRule) DeepCopyInto(out *AutoHealingRule) {
	*out = *in
	out.TypeMeta = in.TypeMeta
	if in.ObjectMeta.GetName() != "" || in.ObjectMeta.GetNamespace() != "" {
		in.ObjectMeta.DeepCopyInto(&out.ObjectMeta)
	}
	in.Spec.DeepCopyInto(&out.Spec)
	in.Status.DeepCopyInto(&out.Status)
}

func (in *AutoHealingRule) DeepCopy() *AutoHealingRule {
	if in == nil {
		return nil
	}
	out := new(AutoHealingRule)
	in.DeepCopyInto(out)
	return out
}

type AutoHealingRuleSpec struct {
	TargetService string                `json:"targetService"`
	Condition     AutoHealingCondition  `json:"condition"`
	Action        AutoHealingActionSpec `json:"action"`
	RiskLevel     string                `json:"riskLevel,omitempty"`
}

func (in *AutoHealingRuleSpec) DeepCopyInto(out *AutoHealingRuleSpec) {
	*out = *in
	out.Condition = in.Condition
	in.Action.DeepCopyInto(&out.Action)
}

type AutoHealingCondition struct {
	Metric      string  `json:"metric"`
	Operator    string  `json:"operator"`
	Threshold   float64 `json:"threshold"`
	ForDuration string  `json:"forDuration,omitempty"`
}

func (in *AutoHealingCondition) DeepCopyInto(out *AutoHealingCondition) {
	*out = *in
}

type AutoHealingActionSpec struct {
	Type       string            `json:"type"`
	Parameters map[string]string `json:"parameters,omitempty"`
}

func (in *AutoHealingActionSpec) DeepCopyInto(out *AutoHealingActionSpec) {
	*out = *in
	if in.Parameters != nil {
		out.Parameters = make(map[string]string, len(in.Parameters))
		for k, v := range in.Parameters {
			out.Parameters[k] = v
		}
	}
}

type AutoHealingRuleStatus struct {
	LastTriggered metav1.Time        `json:"lastTriggered,omitempty"`
	TriggerCount  int32              `json:"triggerCount,omitempty"`
	Conditions    []metav1.Condition `json:"conditions,omitempty"`
}

func (in *AutoHealingRuleStatus) DeepCopyInto(out *AutoHealingRuleStatus) {
	*out = *in
	in.LastTriggered.DeepCopyInto(&out.LastTriggered)
	if in.Conditions != nil {
		out.Conditions = make([]metav1.Condition, len(in.Conditions))
		for i := range in.Conditions {
			in.Conditions[i].DeepCopyInto(&out.Conditions[i])
		}
	}
}

// +kubebuilder:object:root=true
// +k8s:deepcopy-gen:interfaces=k8s.io/apimachinery/pkg/runtime.Object

type AutoHealingRuleList struct {
	metav1.TypeMeta `json:",inline"`
	metav1.ListMeta `json:"metadata,omitempty"`
	Items           []AutoHealingRule `json:"items"`
}

func (in *AutoHealingRuleList) DeepCopyObject() runtime.Object {
	return in.DeepCopy()
}

func (in *AutoHealingRuleList) DeepCopy() *AutoHealingRuleList {
	if in == nil {
		return nil
	}
	out := new(AutoHealingRuleList)
	out.TypeMeta = in.TypeMeta
	in.ListMeta.DeepCopyInto(&out.ListMeta)
	if in.Items != nil {
		out.Items = make([]AutoHealingRule, len(in.Items))
		for i := range in.Items {
			out.Items[i] = *in.Items[i].DeepCopy()
		}
	}
	return out
}

func init() {
	SchemeBuilder.Register(
		func(scheme *runtime.Scheme) error {
			scheme.AddKnownTypes(SchemeGroupVersion, &AutoHealingRule{}, &AutoHealingRuleList{})
			metav1.AddToGroupVersion(scheme, SchemeGroupVersion)
			return nil
		},
	)
}

func init() {
	SchemeBuilder.Register(AddToScheme)
}
