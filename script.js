"use strict";

const $ = (id) => document.getElementById(id);
const months = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const incomeSources = ["Salary","Business","Freelancing","Allowance","Investment/Interest","Rental Income","Other Income"];
const expenseCategories = ["Rent/Housing","Food/Groceries","Transportation","Education","Electricity","Mobile/Internet","Medical","Shopping","Entertainment","Insurance","EMI/Loans","Other Expenses"];
const savingSources = ["Bank Savings Account","Fixed Deposit","Recurring Deposit","Mutual Funds","Stocks","PPF","Gold","Cash","Other Savings"];
const DRAFT_KEY = "personalBudgetDraftV1";

let state = {
  entry_type: "manual",
  user_name: "",
  age: "",
  occupation: "",
  family_members: "",
  earning_members: "",
  other_family_income: 0,
  income_rows: [],
  expense_rows: [],
  savings_rows: [],
  yearly_budget: {}
};

let charts = {};
let currentStep = 1;
let confirmAction = null;

function currency(v){ return `₹${Number(v||0).toLocaleString("en-IN",{maximumFractionDigits:2})}`; }
function num(v){ const n=Number(v); return Number.isFinite(n)?n:0; }
function pct(v){ return `${num(v).toFixed(1)}%`; }
function escapeHtml(s){ return String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m])); }

function toast(message, error=false){
  const t=$("toast"); t.textContent=message; t.className=`toast show${error?" error":""}`;
  clearTimeout(window.__toast); window.__toast=setTimeout(()=>t.className="toast",3500);
}
function loader(show,text="Working..."){
  $("loader").classList.toggle("hidden",!show);
  $("loader").querySelector("span").textContent=text;
}
function saveDraft(){
  localStorage.setItem(DRAFT_KEY, JSON.stringify(state));
  $("draftStatus").textContent="Draft saved locally";
}
function loadDraft(){
  try{
    const raw=localStorage.getItem(DRAFT_KEY);
    if(!raw) return false;
    state={...state,...JSON.parse(raw)};
    return true;
  }catch(e){ console.warn(e); return false; }
}
function bindBasics(){
  ["user_name","age","occupation","family_members","earning_members","other_family_income"].forEach(id=>{
    $(id).addEventListener("input",()=>{
      state[id]=$(id).value;
      saveDraft(); calculateAndRender();
    });
    $(id).addEventListener("change",()=>{
      state[id]=$(id).value;
      saveDraft(); calculateAndRender();
    });
  });
}
function syncBasics(){
  ["user_name","age","occupation","family_members","earning_members","other_family_income"].forEach(id=>{
    $(id).value=state[id]??"";
  });
}
function options(list,value=""){
  return `<option value="">Select</option>${list.map(x=>`<option ${x===value?"selected":""}>${escapeHtml(x)}</option>`).join("")}<option value="__custom">Custom…</option>`;
}
function renderRows(type){
  const config={
    income:{container:"incomeRows",key:"income_rows",list:incomeSources,label:"Income Source"},
    expense:{container:"expenseRows",key:"expense_rows",list:expenseCategories,label:"Expense Category"},
    savings:{container:"savingsRows",key:"savings_rows",list:savingSources,label:"Savings / Investment Source"}
  }[type];
  const rows=state[config.key];
  $(config.container).innerHTML=rows.map((r,i)=>`
    <div class="row" data-index="${i}">
      <select class="row-name">${options(config.list,r.category||r.source||"")}</select>
      <input class="row-amount" type="number" min="0" step="0.01" value="${num(r.amount)}" placeholder="0">
      <button class="remove" title="Remove">×</button>
    </div>`).join("");
  $(config.container).querySelectorAll(".row").forEach((el,i)=>{
    const select=el.querySelector(".row-name"), amount=el.querySelector(".row-amount");
    select.addEventListener("change",()=>{
      let value=select.value;
      if(value==="__custom"){
        value=prompt(`Enter ${config.label.toLowerCase()}:`)?.trim()||"";
        if(!value){ renderRows(type); return; }
      }
      const obj=state[config.key][i]; obj.category=value; obj.source=value;
      saveDraft(); calculateAndRender();
    });
    amount.addEventListener("input",()=>{state[config.key][i].amount=num(amount.value);saveDraft();calculateAndRender();});
    el.querySelector(".remove").addEventListener("click",()=>{state[config.key].splice(i,1);saveDraft();renderRows(type);calculateAndRender();});
  });
}
function addRow(type){
  const key={income:"income_rows",expense:"expense_rows",savings:"savings_rows"}[type];
  state[key].push({category:"",source:"",amount:0});
  saveDraft(); renderRows(type); calculateAndRender();
}
function totals(){
  const incomeRows=state.income_rows.reduce((s,r)=>s+num(r.amount),0);
  const other=num(state.other_family_income);
  const income=incomeRows+other;
  const expenses=state.expense_rows.reduce((s,r)=>s+num(r.amount),0);
  const currentSavings=state.savings_rows.reduce((s,r)=>s+num(r.amount),0);
  const savings=income-expenses;
  const savingsRate=income?(savings/income)*100:0;
  const expenseRatio=income?(expenses/income)*100:0;
  return {income,expenses,currentSavings,savings,savingsRate,expenseRatio};
}
function assessment(rate){
  if(rate>=30)return {label:"🌟 Excellent",text:"Your current savings rate is strong based on the entered numbers.",tips:["Keep an emergency fund.","Continue investing consistently.","Review major expenses periodically.","Avoid letting lifestyle costs rise faster than income."]};
  if(rate>=20)return {label:"👍 Good",text:"Your budget shows a healthy positive savings rate.",tips:["Protect your monthly surplus.","Build or maintain an emergency fund.","Compare your largest expense categories regularly."]};
  if(rate>=10)return {label:"⚠️ Needs Improvement",text:"There is a positive surplus, but the savings rate has room to improve.",tips:["Review the top expense categories.","Set a specific monthly savings target.","Reduce avoidable recurring costs where possible.","Automate part of your savings."]};
  return {label:"🚨 Critical",text:"The current savings rate is very low or negative based on the entered data.",tips:["Review expenses that have the biggest impact.","Prioritize essential spending.","Avoid adding unnecessary recurring commitments.","Set a small realistic savings target first."]};
}
function updateSummary(){
  const t=totals();
  $("totalIncome").textContent=currency(t.income);
  $("totalExpenses").textContent=currency(t.expenses);
  $("totalCurrentSavings").textContent=currency(t.currentSavings);
  $("kpiIncome").textContent=currency(t.income);
  $("kpiExpenses").textContent=currency(t.expenses);
  $("kpiSavings").textContent=currency(t.savings);
  $("kpiCurrentSavings").textContent=currency(t.currentSavings);
  $("kpiSavingsRate").textContent=pct(t.savingsRate);
  $("kpiExpenseRatio").textContent=pct(t.expenseRatio);

  const expensePart=t.income>0?Math.min(100,Math.max(0,t.expenseRatio)):0;
  const savePart=t.income>0?Math.min(100,Math.max(0,t.savingsRate)):0;
  $("expenseBar").style.width=`${expensePart}%`; $("savingBar").style.width=`${savePart}%`;
  $("expensePct").textContent=pct(t.expenseRatio); $("savingPct").textContent=pct(t.savingsRate);

  const a=assessment(t.savingsRate);
  $("assessment").innerHTML=`${a.label}<small>${a.text}</small>`;
  $("tips").innerHTML=a.tips.map(x=>`<li>${escapeHtml(x)}</li>`).join("");

  const warning=[];
  if(t.income===0) warning.push("No income has been entered yet.");
  if(t.expenses>t.income && t.income>0) warning.push("Expenses are higher than income.");
  if(t.expenseRatio>=100 && t.income>0) warning.push("Expenses are at or above 100% of income.");
  $("warningBox").textContent=warning.join(" "); $("warningBox").classList.toggle("hidden",!warning.length);

  const byCat={};
  state.expense_rows.forEach(r=>{const k=r.category||"Other";byCat[k]=(byCat[k]||0)+num(r.amount);});
  const top=Object.entries(byCat).sort((a,b)=>b[1]-a[1])[0];
  const insights=[];
  if(t.income>0) insights.push(`Your current expense ratio is ${pct(t.expenseRatio)}.`);
  if(top) insights.push(`${top[0]} is your largest entered expense category at ${currency(top[1])}.`);
  insights.push(t.savings>=0?`Your monthly surplus is ${currency(t.savings)}.`:`Your monthly deficit is ${currency(Math.abs(t.savings))}.`);
  if(t.currentSavings>0) insights.push(`Current savings and investments total ${currency(t.currentSavings)}.`);
  $("insightsText").innerHTML=insights.map(x=>`<p>• ${escapeHtml(x)}</p>`).join("");
}
function calculateAndRender(){ updateSummary(); updateYearDashboard(); updateCharts(); }
function validateStep(step){
  if(step===1){
    const name=$("user_name").value.trim(), age=num($("age").value), family=num($("family_members").value), earning=num($("earning_members").value);
    if(!name){toast("Enter your full name.",true);$("user_name").focus();return false}
    if(age<1||age>120){toast("Age must be between 1 and 120.",true);$("age").focus();return false}
    if(!["Business","Private Sector","Public Sector","Others"].includes($("occupation").value)){toast("Select an occupation.",true);return false}
    if(!Number.isInteger(family)||family<1){toast("Family members must be a positive whole number.",true);return false}
    if(!Number.isInteger(earning)||earning<1||earning>family){toast("Earning members must be positive and cannot exceed family members.",true);return false}
  }
  return true;
}
function showStep(step){
  currentStep=step;
  document.querySelectorAll(".step").forEach(s=>s.classList.toggle("active",Number(s.dataset.step)===step));
  $("stepLabel").textContent=`Step ${step} of 5`;
  $("progressBar").style.width=`${step*20}%`;
  window.scrollTo({top:0,behavior:"smooth"});
}
function prepareYearState(){
  months.forEach(m=>{if(!state.yearly_budget[m])state.yearly_budget[m]={income:0,expenses:0,investment:0};});
}
function updateYearDashboard(){
  prepareYearState();
  const data=months.map(m=>state.yearly_budget[m]||{income:0,expenses:0,investment:0});
  const ai=data.reduce((s,d)=>s+num(d.income),0), ae=data.reduce((s,d)=>s+num(d.expenses),0), surplus=ai-ae;
  $("annualIncome").textContent=currency(ai);$("annualExpenses").textContent=currency(ae);$("annualSurplus").textContent=currency(surplus);$("annualSavingsRate").textContent=pct(ai?surplus/ai*100:0);
  const month=$("yearMonth").value, d=state.yearly_budget[month];
  $("yearEntryTitle").textContent=month;$("yearIncome").value=num(d.income);$("yearExpense").value=num(d.expenses);
  $("yearInvestment").value=num(d.investment);$("yearUninvested").value=currency(Math.max(0,num(d.income)-num(d.expenses)-num(d.investment)));
  renderYearTable();
}
function renderYearTable(){
  const headers=months.map(m=>`<th>${m.slice(0,3)}</th>`).join("");
  let html=`<thead><tr><th>Category</th>${headers}<th>Yearly Total</th></tr></thead><tbody>`;
  const rows=[
    ["Income",m=>num(state.yearly_budget[m]?.income)],
    ["Expenses",m=>num(state.yearly_budget[m]?.expenses)],
    ["Expenses % of Income",m=>{const d=state.yearly_budget[m]||{};return num(d.income)?num(d.expenses)/num(d.income)*100:0}],
    ["Investable Surplus",m=>num(state.yearly_budget[m]?.income)-num(state.yearly_budget[m]?.expenses)],
    ["Savings Rate",m=>{const d=state.yearly_budget[m]||{};const s=num(d.income)-num(d.expenses);return num(d.income)?s/num(d.income)*100:0}],
    ["Investment",m=>num(state.yearly_budget[m]?.investment)],
    ["Uninvested Surplus",m=>{const d=state.yearly_budget[m]||{};return num(d.income)-num(d.expenses)-num(d.investment)}]
  ];
  rows.forEach(([label,fn],idx)=>{
    const vals=months.map(m=>fn(m)); const total=idx===2||idx===4?(num(state.yearly_budget[months[0]]?.income)?0:0):vals.reduce((s,v)=>s+v,0);
    html+=`<tr><td><b>${label}</b></td>${vals.map(v=>`<td>${idx===2||idx===4?pct(v):currency(v)}</td>`).join("")}<td>${idx===2||idx===4?"—":currency(total)}</td></tr>`;
  });
  html+="</tbody>";$("yearTable").innerHTML=html;
}
function updateCharts(){
  const income=months.map(m=>num(state.yearly_budget[m]?.income)), expense=months.map(m=>num(state.yearly_budget[m]?.expenses));
  const rates=months.map((m,i)=>income[i]?((income[i]-expense[i])/income[i])*100:0);
  const ratios=months.map((m,i)=>income[i]?(expense[i]/income[i])*100:0);
  const investment=months.map(m=>num(state.yearly_budget[m]?.investment));
  const uninvested=months.map((m,i)=>income[i]-expense[i]-investment[i]);
  const expenseCat={};state.expense_rows.forEach(r=>expenseCat[r.category||"Other"]=(expenseCat[r.category||"Other"]||0)+num(r.amount));
  const top=Object.entries(expenseCat).sort((a,b)=>b[1]-a[1]).slice(0,5);
  const defs=[
    ["incomeExpenseChart","line",{labels:months,datasets:[{label:"Income",data:income,borderWidth:2},{label:"Expenses",data:expense,borderWidth:2}]}],
    ["expenseChart","doughnut",{labels:Object.keys(expenseCat),datasets:[{data:Object.values(expenseCat)}]}],
    ["savingsRateChart","line",{labels:months,datasets:[{label:"Savings Rate %",data:rates,borderWidth:2}]}],
    ["expenseRatioChart","bar",{labels:months,datasets:[{label:"Expense Ratio %",data:ratios,borderWidth:1},{type:"line",label:"100% Reference",data:months.map(()=>100),borderWidth:2,pointRadius:0}]}],
    ["topExpenseChart","bar",{labels:top.map(x=>x[0]),datasets:[{label:"Amount",data:top.map(x=>x[1]),borderWidth:1}]}],
    ["investmentChart","bar",{labels:months,datasets:[{label:"Investment",data:investment,borderWidth:1},{label:"Uninvested Surplus",data:uninvested,borderWidth:1}]}]
  ];
  defs.forEach(([id,type,data])=>{
    const ctx=$(id).getContext("2d"); if(charts[id]) charts[id].destroy();
    charts[id]=new Chart(ctx,{type,data,options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:"bottom"}},scales:type==="doughnut"?{}:{y:{beginAtZero:true}}}});
  });
}
function bindYearInputs(){
  $("yearMonth").addEventListener("change",updateYearDashboard);
  ["yearIncome","yearExpense","yearInvestment"].forEach(id=>$(id).addEventListener("input",()=>{
    const m=$("yearMonth").value;state.yearly_budget[m]={income:num($("yearIncome").value),expenses:num($("yearExpense").value),investment:num($("yearInvestment").value)};
    saveDraft();updateYearDashboard();updateCharts();
  }));
  $("saveYearData").addEventListener("click",()=>{saveDraft();toast("Month data saved to draft.");});
}
function recordPayload(){
  const t=totals(), a=assessment(t.savingsRate);
  return {...state,total_income:t.income,total_expenses:t.expenses,monthly_savings:t.savings,savings_rate:t.savingsRate,expense_ratio:t.expenseRatio,total_current_savings:t.currentSavings,assessment:a.label};
}
async function saveRecord(){
  if(!validateStep(1)){showStep(1);return}
  const payload=recordPayload(); loader(true,"Saving record...");
  try{
    const r=await fetch("/api/budget",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
    const data=await r.json(); if(!r.ok) throw new Error(data.message||"Save failed");
    toast(`Record #${data.id} saved successfully.`); loadRecords();
  }catch(e){toast(e.message,true)}finally{loader(false)}
}
async function importFile(file){
  if(!file)return;if(file.size>10*1024*1024){toast("File must be 10MB or smaller.",true);return}
  const fd=new FormData();fd.append("file",file);loader(true,"Parsing Excel/CSV...");
  try{
    const r=await fetch("/api/import-excel",{method:"POST",body:fd});const data=await r.json();if(!r.ok)throw new Error(data.message||"Import failed");
    const parsed=data.data;
    const replace=confirm(`Found ${parsed.count} usable rows. Press OK to replace current dynamic rows, or Cancel to merge them.`);
    const addIncome=parsed.incomeRows.map(x=>({category:x.category,amount:x.amount,month:x.month}));
    const addExpense=parsed.expenseRows.map(x=>({category:x.category,amount:x.amount,month:x.month}));
    const addSavings=parsed.savingsRows.map(x=>({category:x.category,amount:x.amount,month:x.month}));
    if(replace){state.income_rows=[];state.expense_rows=[];state.savings_rows=[]}
    state.income_rows.push(...addIncome);state.expense_rows.push(...addExpense);state.savings_rows.push(...addSavings);
    state.entry_type="excel";
    addIncome.forEach(x=>{const m=x.month||"January";state.yearly_budget[m]??={income:0,expenses:0,investment:0};state.yearly_budget[m].income+=num(x.amount)});
    addExpense.forEach(x=>{const m=x.month||"January";state.yearly_budget[m]??={income:0,expenses:0,investment:0};state.yearly_budget[m].expenses+=num(x.amount)});
    addSavings.forEach(x=>{const m=x.month||"January";state.yearly_budget[m]??={income:0,expenses:0,investment:0};state.yearly_budget[m].investment+=num(x.amount)});
    saveDraft();renderAll();toast(`Imported ${parsed.count} rows successfully.`);
  }catch(e){toast(e.message,true)}finally{loader(false)}
}
async function loadRecords(){
  try{
    const r=await fetch("/api/budgets");const d=await r.json();if(!r.ok)throw new Error(d.message);
    const rows=d.records||[];
    $("recordsContent").innerHTML=rows.length?`<div class="table-wrap"><table class="record-table"><thead><tr><th>ID</th><th>Name</th><th>Type</th><th>Date</th><th>Income</th><th>Expenses</th><th>Savings Rate</th><th>Assessment</th><th>Actions</th></tr></thead><tbody>${rows.map(x=>`<tr><td>${x.id}</td><td>${escapeHtml(x.user_name)}</td><td><span class="badge">${x.entry_type==="excel"?"📊 Excel":"✏️ Manual"}</span></td><td>${new Date(x.created_at).toLocaleString()}</td><td>${currency(x.total_income)}</td><td>${currency(x.total_expenses)}</td><td>${pct(x.savings_rate)}</td><td>${escapeHtml(x.assessment)}</td><td><button class="btn secondary view" data-id="${x.id}">👁</button> <button class="btn secondary export" data-id="${x.id}">⬇</button> <button class="btn danger delete" data-id="${x.id}">🗑</button></td></tr>`).join("")}</tbody></table></div>`:"<p>No saved budget records yet.</p>";
    $("recordsContent").querySelectorAll(".view").forEach(b=>b.onclick=()=>viewRecord(b.dataset.id));
    $("recordsContent").querySelectorAll(".export").forEach(b=>b.onclick=()=>window.location.href=`/api/export-excel/${b.dataset.id}`);
    $("recordsContent").querySelectorAll(".delete").forEach(b=>b.onclick=()=>confirmBox("Delete this saved record?",()=>deleteRecord(b.dataset.id)));
  }catch(e){$("recordsContent").innerHTML="<p>Could not load records. Start the server and try again.</p>"}
}
async function viewRecord(id){
  loader(true,"Loading record...");
  try{
    const r=await fetch(`/api/budget/${id}`),d=await r.json();if(!r.ok)throw new Error(d.message);
    const x=d.record;
    const rows=(arr)=>arr.map(r=>`<tr><td>${escapeHtml(r.category||r.source||"")}</td><td>${currency(r.amount)}</td></tr>`).join("");
    $("detailContent").innerHTML=`
      <div class="detail-grid">
        <div class="detail-item"><small>Name</small><b>${escapeHtml(x.user_name)}</b></div>
        <div class="detail-item"><small>Age</small><b>${x.age}</b></div>
        <div class="detail-item"><small>Occupation</small><b>${escapeHtml(x.occupation)}</b></div>
        <div class="detail-item"><small>Family Members</small><b>${x.family_members}</b></div>
        <div class="detail-item"><small>Earning Members</small><b>${x.earning_members}</b></div>
        <div class="detail-item"><small>Entry Type</small><b>${x.entry_type==="excel"?"📊 Excel":"✏️ Manual"}</b></div>
      </div>
      <div class="kpis" style="margin-top:16px"><div class="kpi"><span>Income</span><strong>${currency(x.total_income)}</strong></div><div class="kpi"><span>Expenses</span><strong>${currency(x.total_expenses)}</strong></div><div class="kpi"><span>Savings Rate</span><strong>${pct(x.savings_rate)}</strong></div></div>
      <h3>Income</h3><div class="table-wrap"><table class="record-table"><tr><th>Source</th><th>Amount</th></tr>${rows(x.income_rows)}</table></div>
      <h3>Expenses</h3><div class="table-wrap"><table class="record-table"><tr><th>Category</th><th>Amount</th></tr>${rows(x.expense_rows)}</table></div>
      <h3>Savings & Investments</h3><div class="table-wrap"><table class="record-table"><tr><th>Source</th><th>Amount</th></tr>${rows(x.savings_rows)}</table></div>`;
    $("detailModal").classList.remove("hidden");
  }catch(e){toast(e.message,true)}finally{loader(false)}
}
async function deleteRecord(id){
  try{
    const r=await fetch(`/api/budget/${id}`,{method:"DELETE"}),d=await r.json();if(!r.ok)throw new Error(d.message);
    toast("Record deleted.");loadRecords();
  }catch(e){toast(e.message,true)}
}
function confirmBox(text,fn){$("confirmText").textContent=text;confirmAction=fn;$("confirmModal").classList.remove("hidden")}
function renderAll(){
  syncBasics();renderRows("income");renderRows("expense");renderRows("savings");prepareYearState();updateSummary();updateYearDashboard();updateCharts();
}
function init(){
  const restored=loadDraft(); if(restored)toast("Draft restored from local storage.");
  bindBasics();
  $("addIncome").onclick=()=>addRow("income");$("addExpense").onclick=()=>addRow("expense");$("addSavings").onclick=()=>addRow("savings");
  $("importBtn").onclick=()=>$("excelFile").click();$("excelFile").onchange=e=>importFile(e.target.files[0]);
  document.querySelectorAll(".next").forEach(b=>b.onclick=()=>{if(validateStep(currentStep)){showStep(Math.min(5,currentStep+1));}});
  document.querySelectorAll(".back").forEach(b=>b.onclick=()=>showStep(Math.max(1,currentStep-1)));
  $("calculateBtn").onclick=()=>{if(validateStep(1)){updateSummary();showStep(5);}};
  $("saveBtn").onclick=saveRecord;
  $("resetBtn").onclick=()=>confirmBox("Clear the current draft? Saved backend records will not be deleted.",()=>{localStorage.removeItem(DRAFT_KEY);location.reload()});
  $("recordsBtn").onclick=()=>{$("recordsModal").classList.remove("hidden");loadRecords()};
  $("themeBtn").onclick=()=>{document.body.classList.toggle("dark");localStorage.setItem("budgetTheme",document.body.classList.contains("dark")?"dark":"light")};
  document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>$(b.dataset.close).classList.add("hidden"));
  $("confirmCancel").onclick=()=>{$("confirmModal").classList.add("hidden");confirmAction=null};
  $("confirmOk").onclick=()=>{const fn=confirmAction;$("confirmModal").classList.add("hidden");confirmAction=null;if(fn)fn()};
  bindYearInputs();
  if(localStorage.getItem("budgetTheme")==="dark")document.body.classList.add("dark");
  renderAll();
  window.addEventListener("beforeunload",saveDraft);
}
document.addEventListener("DOMContentLoaded",init);
