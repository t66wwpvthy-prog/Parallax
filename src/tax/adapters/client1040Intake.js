/* ============================================================================

   ADAPTER: Client 1040 intake JSON → composeAnnualFederalTax input

   Maps a human-friendly intake shape (derived from a client 1040) into the

   composer contract. Does not calculate tax law — reshapes and routes fields.

   ============================================================================ */



const PASS_THROUGH_LINE_IDS = ['line11a', 'line15', 'line17', 'line19', 'line20', 'line23'];



export function client1040IntakeToComposerInput(intake){

  if(!intake || typeof intake !== 'object' || Array.isArray(intake)){

    throw new Error('intake must be a plain object');

  }

  if(!intake.filingStatus){

    throw new Error('intake.filingStatus is required');

  }



  const input = { filingStatus: intake.filingStatus };



  if(intake.taxYear !== undefined) input.taxYear = intake.taxYear;



  if(intake.taxableOrdinaryIncome !== undefined){

    input.taxableOrdinaryIncome = intake.taxableOrdinaryIncome;

  }



  if(intake.income){

    input.supplied = { ...(input.supplied || {}) };

    const inc = intake.income;



    if(inc.wages !== undefined) input.supplied.line1z = inc.wages;

    if(inc.taxableInterest !== undefined) input.supplied.line2b = inc.taxableInterest;

    if(inc.ordinaryDividends !== undefined) input.supplied.line3b = inc.ordinaryDividends;

    if(inc.qualifiedDividends !== undefined) input.supplied.line3a = inc.qualifiedDividends;

    if(inc.iraDistributions !== undefined) input.supplied.line4a = inc.iraDistributions;

    if(inc.taxableIra !== undefined) input.supplied.line4b = inc.taxableIra;

    if(inc.pensionAmount !== undefined) input.supplied.line5a = inc.pensionAmount;

    if(inc.taxablePensions !== undefined) input.supplied.line5b = inc.taxablePensions;

    if(inc.socialSecurityBenefits !== undefined) input.supplied.line6a = inc.socialSecurityBenefits;

    if(inc.taxableSS !== undefined) input.supplied.line6b = inc.taxableSS;

    if(inc.taxableSocialSecurity !== undefined) input.supplied.line6b = inc.taxableSocialSecurity;

    if(inc.capitalGain !== undefined) input.supplied.line7a = inc.capitalGain;

    if(inc.otherIncome !== undefined) input.supplied.line8 = inc.otherIncome;

    if(inc.schedule1Income !== undefined) input.supplied.line8 = inc.schedule1Income;



    if(inc.netLongTermCapitalGains !== undefined){

      input.capitalGains = {

        ...(input.capitalGains || {}),

        netLongTermCapitalGains: inc.netLongTermCapitalGains,

      };

    }



    if(inc.socialSecurity){

      input.socialSecurity = {

        filingStatus: intake.filingStatus,

        ...inc.socialSecurity,

      };

    }

  }



  if(intake.adjustments){

    if(intake.adjustments.total !== undefined){

      input.supplied = { ...(input.supplied || {}), line10: intake.adjustments.total };

    }

    if(intake.adjustments.line10 !== undefined){

      input.supplied = { ...(input.supplied || {}), line10: intake.adjustments.line10 };

    }

    if(intake.adjustments.ira){

      input.traditionalIra = {

        filingStatus: intake.filingStatus,

        ...intake.adjustments.ira,

      };

    }

  }



  if(intake.deductions){

    input.deductions = { ...intake.deductions };

    if(intake.deductions.itemizedAmount !== undefined){

      input.supplied = { ...(input.supplied || {}), line12e: intake.deductions.itemizedAmount };

    }

    if(intake.deductions.qbi !== undefined){

      input.supplied = { ...(input.supplied || {}), line13a: intake.deductions.qbi };

    }

    if(intake.deductions.additional !== undefined){

      input.supplied = { ...(input.supplied || {}), line13b: intake.deductions.additional };

    }

  }



  if(intake.passThrough){

    input.passThrough = { ...(input.passThrough || {}) };

    for(const lineId of PASS_THROUGH_LINE_IDS){

      if(intake.passThrough[lineId] !== undefined){

        input.passThrough[lineId] = intake.passThrough[lineId];

      }

    }

    if(intake.passThrough.payments !== undefined){

      input.passThrough.payments = intake.passThrough.payments;

    }

  }



  if(intake.supplied){

    input.supplied = { ...(input.supplied || {}), ...intake.supplied };

  }



  if(intake.socialSecurity){

    input.socialSecurity = { filingStatus: intake.filingStatus, ...intake.socialSecurity };

  }

  if(intake.traditionalIra){

    input.traditionalIra = { filingStatus: intake.filingStatus, ...intake.traditionalIra };

  }

  if(intake.capitalGains){

    input.capitalGains = { ...(input.capitalGains || {}), ...intake.capitalGains };

  }



  if(intake.scheduleD){

    input.scheduleD = { ...intake.scheduleD };

  }



  return input;

}



export function reconcileTaxTotal(result, theirLine24, tolerance = 1){

  if(theirLine24 === undefined || theirLine24 === null) return null;

  const computed = result.totalFederalTax;

  const delta = Math.round((computed - theirLine24 + Number.EPSILON) * 100) / 100;

  return {

    theirLine24,

    computedLine24: computed,

    delta,

    withinTolerance: Math.abs(delta) <= tolerance,

    taxTotalScope: result.taxTotalScope,

  };

}


