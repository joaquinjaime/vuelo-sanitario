package com.vuelossanitarios.backend.service;
import com.vuelossanitarios.backend.api.ApiException;
import com.vuelossanitarios.backend.api.dto.PatientDtos.*;
import com.vuelossanitarios.backend.domain.patient.Patient;
import com.vuelossanitarios.backend.domain.person.Person;
import com.vuelossanitarios.backend.repository.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
@Service public class PatientService {private final PatientRepository patients;private final PersonRepository persons;public PatientService(PatientRepository p,PersonRepository pe){patients=p;persons=pe;}
 @Transactional public PatientView create(CreatePatient r){Person person;if(r.personId()!=null){person=persons.findById(r.personId()).orElseThrow(()->new ApiException(HttpStatus.NOT_FOUND,"Persona inexistente"));}else{if(blank(r.nombre())||blank(r.apellido()))throw new ApiException(HttpStatus.BAD_REQUEST,"Nombre y apellido son obligatorios para una persona nueva");if(r.dni()!=null&&!r.dni().isBlank()&&persons.existsByDni(r.dni()))throw new ApiException(HttpStatus.CONFLICT,"El DNI ya pertenece a otra persona");person=new Person();person.setNombre(r.nombre());person.setApellido(r.apellido());person.setDni(value(r.dni()));person.setFechaNacimiento(r.fechaNacimiento());person.setTelefono(value(r.telefono()));persons.save(person);}if(patients.findByPersonId(person.getId()).isPresent())throw new ApiException(HttpStatus.CONFLICT,"La persona ya está registrada como paciente");Patient p=new Patient();p.setPerson(person);patients.save(p);return new PatientView(p.getId(),person.getId(),person.getNombre(),person.getApellido());}private boolean blank(String s){return s==null||s.isBlank();}private String value(String s){return blank(s)?null:s.trim();}}
